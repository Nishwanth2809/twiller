import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  collectBoundedThreadSources,
  computeSourceFingerprint,
  validateInsightGrounding,
  acquireGenerationLease,
  commitInsight,
  failInsightLease,
  generateConversationIntelligence,
  MAX_ANALYZED_REPLIES,
} from "../conversation-intelligence.js";
import { MockIntelligenceProvider } from "../intelligence-provider.js";
import ConversationInsight from "../models/conversationInsight.js";

// Helper to construct in-memory mock TweetModel for pure unit testing
function createMockTweetModel(posts = []) {
  const store = new Map(posts.map(p => [String(p._id), { ...p }]));

  return {
    findById: async (id) => {
      const post = store.get(String(id));
      return post ? { ...post } : null;
    },
    find: (query) => {
      let results = Array.from(store.values());

      if (query.parentId) {
        if (query.parentId.$in) {
          const idStrings = new Set(query.parentId.$in.map(String));
          results = results.filter(p => idStrings.has(String(p.parentId)));
        } else {
          results = results.filter(p => String(p.parentId) === String(query.parentId));
        }
      }

      return {
        sort: (sortSpec) => {
          results.sort((a, b) => {
            if (sortSpec.timestamp) {
              const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
              if (diff !== 0) return sortSpec.timestamp === 1 ? diff : -diff;
            }
            return String(a._id).localeCompare(String(b._id));
          });
          return {
            lean: async () => results.map(r => ({ ...r })),
          };
        },
      };
    },
  };
}

// Helper to construct in-memory mock InsightModel
function createMockInsightModel() {
  const store = new Map();

  return {
    findOne: async ({ post, scopeKey }) => {
      const key = `${post}:${scopeKey}`;
      const found = store.get(key);
      return found ? { ...found } : null;
    },
    findOneAndUpdate: async ({ post, scopeKey, $or }, update, options = {}) => {
      const key = `${post}:${scopeKey}`;
      const existing = store.get(key);

      if (existing && $or) {
        const now = new Date();
        const matchesCondition = $or.some(cond => {
          if (cond.status?.$ne && existing.status === cond.status.$ne) return false;
          if (cond.leaseExpiresAt?.$lt && existing.leaseExpiresAt >= cond.leaseExpiresAt.$lt) return false;
          return true;
        });

        if (!matchesCondition) {
          return null; // lease cannot be acquired
        }
      }

      const updated = {
        ...(existing || { post, scopeKey, createdAt: new Date() }),
        ...update.$set,
        updatedAt: new Date(),
      };
      store.set(key, updated);
      return { ...updated };
    },
    create: async (data) => {
      const key = `${data.post}:${data.scopeKey}`;
      if (store.has(key)) {
        const err = new Error("Duplicate key");
        err.code = 11000;
        throw err;
      }
      const created = { ...data, createdAt: new Date(), updatedAt: new Date() };
      store.set(key, created);
      return { ...created };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. BOUNDED DESCENDANT SOURCE TRAVERSAL TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("TRAVERSAL: zero replies returns empty source arrays", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const mockModel = createMockTweetModel([
    { _id: rootId, content: "Root post", parentId: null, comments: 0, timestamp: new Date() },
  ]);

  const result = await collectBoundedThreadSources(rootId, { tweetModel: mockModel });
  assert.equal(String(result.rootPost._id), String(rootId));
  assert.equal(result.sources.length, 0);
  assert.equal(result.activeSources.length, 0);
});

test("TRAVERSAL: direct replies are collected and sorted chronologically", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(2000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(1000) };
  const r3 = { _id: new mongoose.Types.ObjectId(), content: "Reply 3", parentId: rootId, timestamp: new Date(3000) };

  const mockModel = createMockTweetModel([
    { _id: rootId, content: "Root post", parentId: null, comments: 3, timestamp: new Date(500) },
    r1, r2, r3,
  ]);

  const result = await collectBoundedThreadSources(rootId, { tweetModel: mockModel });
  assert.equal(result.sources.length, 3);
  assert.equal(result.activeSources.length, 3);
  // Deterministic order: r2 (1000) -> r1 (2000) -> r3 (3000)
  assert.equal(String(result.sources[0]._id), String(r2._id));
  assert.equal(String(result.sources[1]._id), String(r1._id));
  assert.equal(String(result.sources[2]._id), String(r3._id));
});

test("TRAVERSAL: nested replies are traversed across multiple tree levels", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r1_1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1.1", parentId: r1._id, timestamp: new Date(2000) };
  const r1_1_1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1.1.1", parentId: r1_1._id, timestamp: new Date(3000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(1500) };

  const mockModel = createMockTweetModel([
    { _id: rootId, content: "Root", parentId: null, comments: 4, timestamp: new Date(500) },
    r1, r1_1, r1_1_1, r2,
  ]);

  const result = await collectBoundedThreadSources(rootId, { tweetModel: mockModel });
  assert.equal(result.sources.length, 4);
  assert.equal(result.activeSources.length, 4);

  // Sorted by timestamp: r1 (1000), r2 (1500), r1_1 (2000), r1_1_1 (3000)
  assert.equal(String(result.sources[0]._id), String(r1._id));
  assert.equal(String(result.sources[1]._id), String(r2._id));
  assert.equal(String(result.sources[2]._id), String(r1_1._id));
  assert.equal(String(result.sources[3]._id), String(r1_1_1._id));
});

test("TRAVERSAL: deeply nested bounded tree halts at maxDepth or maxReplies", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const posts = [{ _id: rootId, content: "Root", parentId: null, comments: 15, timestamp: new Date(0) }];

  // Build a linear chain of 15 levels
  let currentParent = rootId;
  for (let i = 1; i <= 15; i++) {
    const childId = new mongoose.Types.ObjectId();
    posts.push({
      _id: childId,
      content: `Chain node ${i}`,
      parentId: currentParent,
      timestamp: new Date(i * 1000),
    });
    currentParent = childId;
  }

  const mockModel = createMockTweetModel(posts);

  // Restrict to maxDepth = 4
  const depthBounded = await collectBoundedThreadSources(rootId, { tweetModel: mockModel, maxDepth: 4 });
  assert.equal(depthBounded.sources.length, 4);

  // Restrict to maxReplies = 6
  const replyBounded = await collectBoundedThreadSources(rootId, { tweetModel: mockModel, maxReplies: 6 });
  assert.equal(replyBounded.sources.length, 6);
});

test("TRAVERSAL: maximum source bound caps large threads at MAX_ANALYZED_REPLIES (50)", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const posts = [{ _id: rootId, content: "Root", parentId: null, comments: 75, timestamp: new Date(0) }];

  for (let i = 1; i <= 75; i++) {
    posts.push({
      _id: new mongoose.Types.ObjectId(),
      content: `Reply ${i}`,
      parentId: rootId,
      timestamp: new Date(i * 1000),
    });
  }

  const mockModel = createMockTweetModel(posts);
  const result = await collectBoundedThreadSources(rootId, { tweetModel: mockModel });
  assert.equal(result.sources.length, MAX_ANALYZED_REPLIES);
  assert.equal(result.sources.length, 50);
});

test("TRAVERSAL: deleted leaf reply is captured in sources but excluded from activeSources", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Active", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "", parentId: rootId, deletedAt: new Date(), timestamp: new Date(2000) };

  const mockModel = createMockTweetModel([
    { _id: rootId, content: "Root", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);

  const result = await collectBoundedThreadSources(rootId, { tweetModel: mockModel });
  assert.equal(result.sources.length, 2);
  assert.equal(result.activeSources.length, 1);
  assert.equal(String(result.activeSources[0]._id), String(r1._id));
});

test("TRAVERSAL: tombstoned reply with descendants allows traversal to living descendants", async () => {
  const rootId = new mongoose.Types.ObjectId();
  // r1 is tombstoned/deleted, but child r1_1 is alive!
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "", parentId: rootId, deletedAt: new Date(1500), timestamp: new Date(1000) };
  const r1_1 = { _id: new mongoose.Types.ObjectId(), content: "Living grandchild", parentId: r1._id, timestamp: new Date(2000) };

  const mockModel = createMockTweetModel([
    { _id: rootId, content: "Root", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r1_1,
  ]);

  const result = await collectBoundedThreadSources(rootId, { tweetModel: mockModel });
  assert.equal(result.sources.length, 2);
  assert.equal(result.activeSources.length, 1);
  assert.equal(String(result.activeSources[0]._id), String(r1_1._id));
});

test("TRAVERSAL: deleted root post throws ROOT_POST_UNAVAILABLE (404)", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const mockModel = createMockTweetModel([
    { _id: rootId, content: "Deleted root", parentId: null, deletedAt: new Date(), timestamp: new Date(0) },
  ]);

  await assert.rejects(
    async () => collectBoundedThreadSources(rootId, { tweetModel: mockModel }),
    (err) => {
      assert.equal(err.code, "ROOT_POST_UNAVAILABLE");
      assert.equal(err.status, 404);
      return true;
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. FINGERPRINT SPECIFICATION & STABILITY TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("FINGERPRINT: stable when thread components remain unchanged", () => {
  const root = { _id: new mongoose.Types.ObjectId(), timestamp: new Date(1000), comments: 2 };
  const s1 = { _id: new mongoose.Types.ObjectId(), timestamp: new Date(2000), deletedAt: null };
  const s2 = { _id: new mongoose.Types.ObjectId(), timestamp: new Date(3000), deletedAt: null };

  const fp1 = computeSourceFingerprint(root, [s1, s2]);
  const fp2 = computeSourceFingerprint(root, [s1, s2]);
  assert.equal(fp1, fp2);
  assert.equal(typeof fp1, "string");
  assert.equal(fp1.length, 64);
});

test("FINGERPRINT: changes when a new direct reply is added", () => {
  const root = { _id: new mongoose.Types.ObjectId(), timestamp: new Date(1000), comments: 1 };
  const s1 = { _id: new mongoose.Types.ObjectId(), timestamp: new Date(2000), deletedAt: null };

  const fpBefore = computeSourceFingerprint(root, [s1]);

  const s2 = { _id: new mongoose.Types.ObjectId(), timestamp: new Date(3000), deletedAt: null };
  const rootUpdated = { ...root, comments: 2 };
  const fpAfter = computeSourceFingerprint(rootUpdated, [s1, s2]);

  assert.notEqual(fpBefore, fpAfter);
});

test("FINGERPRINT: changes when a nested reply is added", () => {
  const root = { _id: new mongoose.Types.ObjectId(), timestamp: new Date(1000), comments: 1 };
  const s1 = { _id: new mongoose.Types.ObjectId(), timestamp: new Date(2000), deletedAt: null };

  const fp1 = computeSourceFingerprint(root, [s1]);

  const sNested = { _id: new mongoose.Types.ObjectId(), parentId: s1._id, timestamp: new Date(2500), deletedAt: null };
  const fp2 = computeSourceFingerprint(root, [s1, sNested]);

  assert.notEqual(fp1, fp2);
});

test("FINGERPRINT: changes when a source reply deletion state changes", () => {
  const root = { _id: new mongoose.Types.ObjectId(), timestamp: new Date(1000), comments: 1 };
  const s1 = { _id: new mongoose.Types.ObjectId(), timestamp: new Date(2000), deletedAt: null };

  const fpActive = computeSourceFingerprint(root, [s1]);

  const s1Deleted = { ...s1, deletedAt: new Date(3000) };
  const fpDeleted = computeSourceFingerprint(root, [s1Deleted]);

  assert.notEqual(fpActive, fpDeleted);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GROUNDING VALIDATOR & CITATION INTEGRITY TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("GROUNDING: accepts fully grounded insights with valid source citations", () => {
  const id1 = new mongoose.Types.ObjectId();
  const id2 = new mongoose.Types.ObjectId();

  const insight = {
    overview: "A focused discussion on distributed systems.",
    keyPoints: [
      { statement: "First takeaway supported by reply 1", sourcePostIds: [id1] },
      { statement: "Second takeaway supported by reply 2", sourcePostIds: [id2] },
    ],
    perspectives: [
      { viewpoint: "Viewpoint supported by both replies", sourcePostIds: [id1, id2] },
    ],
  };

  const validated = validateInsightGrounding(insight, [id1, id2]);
  assert.equal(validated.overview, insight.overview);
  assert.equal(validated.keyPoints.length, 2);
  assert.equal(validated.perspectives.length, 1);
  assert.equal(String(validated.keyPoints[0].sourcePostIds[0]), String(id1));
});

test("GROUNDING: rejects unknown/hallucinated citation with INSIGHT_GROUNDING_FAILED", () => {
  const validId = new mongoose.Types.ObjectId();
  const hallucinatedId = new mongoose.Types.ObjectId();

  const insight = {
    overview: "Discussion overview.",
    keyPoints: [
      { statement: "Point 1", sourcePostIds: [validId] },
      { statement: "Fabricated point", sourcePostIds: [hallucinatedId] },
    ],
    perspectives: [
      { viewpoint: "Valid viewpoint", sourcePostIds: [validId] },
    ],
  };

  assert.throws(
    () => validateInsightGrounding(insight, [validId]),
    (err) => {
      assert.equal(err.code, "INSIGHT_GROUNDING_FAILED");
      assert.equal(err.status, 422);
      assert.match(err.message, /invalid or ungrounded post ID/);
      return true;
    }
  );
});

test("GROUNDING: rejects source ID from another thread or unsupplied DB post", () => {
  const threadASourceId = new mongoose.Types.ObjectId();
  const threadBSourceId = new mongoose.Types.ObjectId();
  const unsuppliedDbPostId = new mongoose.Types.ObjectId();

  const insightWithThreadB = {
    overview: "Discussion overview.",
    keyPoints: [{ statement: "Point citing Thread B post", sourcePostIds: [threadBSourceId] }],
    perspectives: [{ viewpoint: "Viewpoint", sourcePostIds: [threadASourceId] }],
  };

  assert.throws(
    () => validateInsightGrounding(insightWithThreadB, [threadASourceId]),
    (err) => {
      assert.equal(err.code, "INSIGHT_GROUNDING_FAILED");
      return true;
    }
  );

  const insightWithUnsupplied = {
    overview: "Discussion overview.",
    keyPoints: [{ statement: "Point citing unsupplied DB post", sourcePostIds: [unsuppliedDbPostId] }],
    perspectives: [{ viewpoint: "Viewpoint", sourcePostIds: [threadASourceId] }],
  };

  assert.throws(
    () => validateInsightGrounding(insightWithUnsupplied, [threadASourceId]),
    (err) => {
      assert.equal(err.code, "INSIGHT_GROUNDING_FAILED");
      return true;
    }
  );
});

test("GROUNDING: safely normalizes and deduplicates repeated citations", () => {
  const validId = new mongoose.Types.ObjectId();
  const insightWithDuplicates = {
    overview: "Discussion overview.",
    keyPoints: [{ statement: "Point with duplicate citations", sourcePostIds: [validId, validId, String(validId)] }],
    perspectives: [{ viewpoint: "Viewpoint with duplicate citations", sourcePostIds: [validId, validId] }],
  };

  const validated = validateInsightGrounding(insightWithDuplicates, [validId]);
  assert.equal(validated.keyPoints[0].sourcePostIds.length, 1);
  assert.equal(String(validated.keyPoints[0].sourcePostIds[0]), String(validId));
  assert.equal(validated.perspectives[0].sourcePostIds.length, 1);
  assert.equal(String(validated.perspectives[0].sourcePostIds[0]), String(validId));
});

test("GROUNDING: rejects missing citations on keyPoints or perspectives", () => {
  const validId = new mongoose.Types.ObjectId();

  const missingKeyPointCitation = {
    overview: "Overview",
    keyPoints: [{ statement: "Point with no citations", sourcePostIds: [] }],
    perspectives: [{ viewpoint: "Viewpoint", sourcePostIds: [validId] }],
  };

  assert.throws(
    () => validateInsightGrounding(missingKeyPointCitation, [validId]),
    (err) => {
      assert.equal(err.code, "INSIGHT_GROUNDING_FAILED");
      return true;
    }
  );

  const missingPerspectiveCitation = {
    overview: "Overview",
    keyPoints: [{ statement: "Point", sourcePostIds: [validId] }],
    perspectives: [{ viewpoint: "Viewpoint with no citations", sourcePostIds: [] }],
  };

  assert.throws(
    () => validateInsightGrounding(missingPerspectiveCitation, [validId]),
    (err) => {
      assert.equal(err.code, "INSIGHT_GROUNDING_FAILED");
      return true;
    }
  );
});

test("GROUNDING: rejects malformed provider outputs", () => {
  const validId = new mongoose.Types.ObjectId();

  const isGroundingError = (err) => err.code === "INSIGHT_GROUNDING_FAILED";

  assert.throws(() => validateInsightGrounding(null, [validId]), isGroundingError);
  assert.throws(() => validateInsightGrounding({ overview: "" }, [validId]), isGroundingError);
  assert.throws(() => validateInsightGrounding({ overview: "OK", keyPoints: [] }, [validId]), isGroundingError);
  assert.throws(() => validateInsightGrounding({ overview: "OK", keyPoints: [{ statement: "P", sourcePostIds: [validId] }], perspectives: [] }, [validId]), isGroundingError);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MOCK INTELLIGENCE PROVIDER TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("MOCK PROVIDER: deterministic output derived from active sources", async () => {
  const root = { _id: new mongoose.Types.ObjectId(), content: "Should we adopt SQLite for local development?" };
  const s1 = { _id: new mongoose.Types.ObjectId(), content: "Yes, SQLite is fast and zero configuration." };
  const s2 = { _id: new mongoose.Types.ObjectId(), content: "Watch out for concurrency write locks in test runs." };

  const provider = new MockIntelligenceProvider();
  const out1 = await provider.generateThreadInsight({ rootPost: root, sources: [s1, s2] });
  const out2 = await provider.generateThreadInsight({ rootPost: root, sources: [s1, s2] });

  assert.deepEqual(out1, out2);
  assert.match(out1.overview, /SQLite/);
  assert.equal(out1.keyPoints.length > 0, true);
  assert.equal(out1.perspectives.length > 0, true);

  // All emitted sourcePostIds match actual input IDs
  const validIds = new Set([String(s1._id), String(s2._id)]);
  for (const kp of out1.keyPoints) {
    for (const id of kp.sourcePostIds) assert.equal(validIds.has(String(id)), true);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ATOMIC DB LEASE & CACHE SCOPE TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("ATOMIC LEASE: prevents concurrent duplicate generation and respects lease duration", async () => {
  const mockInsightModel = createMockInsightModel();
  const postId = new mongoose.Types.ObjectId();

  // First worker acquires lease
  const lease1 = await acquireGenerationLease(postId, {
    scopeKey: "public",
    insightModel: mockInsightModel,
    leaseDurationMs: 30000,
  });
  assert.equal(lease1.acquired, true);
  assert.equal(lease1.record.status, "generating");

  // Second worker attempts concurrent acquisition -> refused!
  const lease2 = await acquireGenerationLease(postId, {
    scopeKey: "public",
    insightModel: mockInsightModel,
    leaseDurationMs: 30000,
  });
  assert.equal(lease2.acquired, false);
  assert.equal(lease2.record.status, "generating");

  // Different scopeKey can acquire independently
  const leaseCustom = await acquireGenerationLease(postId, {
    scopeKey: "circle-members",
    insightModel: mockInsightModel,
  });
  assert.equal(leaseCustom.acquired, true);

  // Commit lease 1
  await commitInsight(postId, "public", {
    fingerprint: "abc123hash",
    overview: "Committed overview",
    keyPoints: [],
    perspectives: [],
    analyzedReplyCount: 5,
    latestReplyTimestamp: new Date(),
  }, { insightModel: mockInsightModel });

  const committed = await mockInsightModel.findOne({ post: postId, scopeKey: "public" });
  assert.equal(committed.status, "completed");
  assert.equal(committed.overview, "Committed overview");
});

test("ATOMIC LEASE: expired lease from crashed process can be re-acquired", async () => {
  const mockInsightModel = createMockInsightModel();
  const postId = new mongoose.Types.ObjectId();

  // Worker 1 crashes with an old expired lease
  await mockInsightModel.create({
    post: postId,
    scopeKey: "public",
    status: "generating",
    leaseExpiresAt: new Date(Date.now() - 5000), // expired 5 seconds ago
  });

  // Worker 2 attempts lease -> re-acquires successfully!
  const lease2 = await acquireGenerationLease(postId, {
    scopeKey: "public",
    insightModel: mockInsightModel,
  });
  assert.equal(lease2.acquired, true);
  assert.equal(lease2.record.status, "generating");
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. FULL WORKFLOW: GENERATE CONVERSATION INTELLIGENCE
// ─────────────────────────────────────────────────────────────────────────────

test("WORKFLOW: rejects threads with fewer than 2 replies (NOT_ENOUGH_REPLIES)", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Lone reply", parentId: rootId, timestamp: new Date(1000) };

  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root post", parentId: null, comments: 1, timestamp: new Date(0) },
    r1,
  ]);
  const mockInsightModel = createMockInsightModel();

  await assert.rejects(
    async () => generateConversationIntelligence(rootId, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
    }),
    (err) => {
      assert.equal(err.code, "NOT_ENOUGH_REPLIES");
      assert.equal(err.status, 400);
      return true;
    }
  );
});

test("WORKFLOW: successfully generates, grounds, and caches thread insight", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1 with clear point", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2 offering counter-argument", parentId: rootId, timestamp: new Date(2000) };

  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "What is your experience with Phase 7?", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();
  const provider = new MockIntelligenceProvider();

  // Run 1: Generates new insight
  const res1 = await generateConversationIntelligence(rootId, {
    tweetModel: mockTweetModel,
    insightModel: mockInsightModel,
    provider,
  });

  assert.equal(res1.fresh, true);
  assert.equal(res1.sourceCount, 2);
  assert.equal(res1.insight.status, "completed");
  assert.equal(res1.insight.keyPoints.length > 0, true);
  assert.equal(res1.insight.perspectives.length > 0, true);

  // Run 2: Unchanged thread returns cached result instantly without calling provider
  let providerCalled = false;
  provider.generateThreadInsight = async () => { providerCalled = true; };

  const res2 = await generateConversationIntelligence(rootId, {
    tweetModel: mockTweetModel,
    insightModel: mockInsightModel,
    provider,
  });

  assert.equal(providerCalled, false);
  assert.equal(res2.fresh, true);
  assert.equal(res2.insight.fingerprint, res1.insight.fingerprint);
});
