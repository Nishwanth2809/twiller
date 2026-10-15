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
  getIntelligenceForPost,
  requestIntelligenceGeneration,
  insightView,
  getIntelligenceProvider,
  setIntelligenceProvider,
  resetIntelligenceProvider,
  MAX_ANALYZED_REPLIES,
  MIN_ANALYSIS_REPLIES,
  LEASE_DURATION_MS,
  PROVIDER_TIMEOUT_MS,
  USER_RATE_LIMIT,
  POST_COOLDOWN_MS,
} from "../conversation-intelligence.js";
import { MockIntelligenceProvider } from "../intelligence-provider.js";
import ConversationInsight from "../models/conversationInsight.js";
import Throttle from "../models/throttle.js";
import { HttpError } from "../security.js";

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
    _store: store,
    findOne: async (query) => {
      const post = query.post;
      const scopeKey = query.scopeKey || "public";
      const key = `${post}:${scopeKey}`;
      const found = store.get(key);
      if (!found) return null;
      if (query.status && found.status !== query.status) return null;
      return { ...found };
    },
    findOneAndUpdate: async ({ post, scopeKey, $or }, update, options = {}) => {
      const sKey = scopeKey || "public";
      const key = `${post}:${sKey}`;
      const existing = store.get(key);

      if (existing && $or) {
        const now = new Date();
        const matchesCondition = $or.some(cond => {
          if (cond.status?.$ne && existing.status === cond.status.$ne) return false;
          if (cond.leaseExpiresAt?.$lt && (!existing.leaseExpiresAt || existing.leaseExpiresAt >= cond.leaseExpiresAt.$lt)) return false;
          if (cond.leaseExpiresAt === null && existing.leaseExpiresAt !== null) return false;
          return true;
        });

        if (!matchesCondition) {
          return null; // lease cannot be acquired
        }
      }

      const updated = {
        ...(existing || { post, scopeKey: sKey, createdAt: new Date() }),
        ...update.$set,
        updatedAt: new Date(),
      };
      store.set(key, updated);
      return { ...updated };
    },
    create: async (data) => {
      const sKey = data.scopeKey || "public";
      const key = `${data.post}:${sKey}`;
      if (store.has(key)) {
        const err = new Error("Duplicate key");
        err.code = 11000;
        throw err;
      }
      const created = { ...data, scopeKey: sKey, createdAt: new Date(), updatedAt: new Date() };
      store.set(key, created);
      return { ...created };
    },
  };
}

// Helper to construct in-memory mock CircleModel
function createMockCircleModel(circles = []) {
  const store = new Map(circles.map(c => [String(c._id), { ...c }]));
  return {
    findById: (id) => ({
      select: async () => {
        const c = store.get(String(id));
        return c ? { ...c } : null;
      },
    }),
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

// ─────────────────────────────────────────────────────────────────────────────
// 7. GET /post/:id/intelligence ENDPOINT TESTS (READ-ONLY)
// ─────────────────────────────────────────────────────────────────────────────

test("GET INTELLIGENCE: unknown post returns 404 POST_NOT_FOUND", async () => {
  const mockTweetModel = createMockTweetModel([]);
  const mockInsightModel = createMockInsightModel();
  const unknownId = new mongoose.Types.ObjectId();

  await assert.rejects(
    async () => getIntelligenceForPost(unknownId, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
    }),
    (err) => {
      assert.equal(err.code, "POST_NOT_FOUND");
      assert.equal(err.status, 404);
      return true;
    }
  );
});

test("GET INTELLIGENCE: deleted root post returns 404 POST_NOT_FOUND", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Deleted post", parentId: null, deletedAt: new Date(), timestamp: new Date(0) },
  ]);
  const mockInsightModel = createMockInsightModel();

  await assert.rejects(
    async () => getIntelligenceForPost(rootId, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
    }),
    (err) => {
      assert.equal(err.code, "POST_NOT_FOUND");
      assert.equal(err.status, 404);
      return true;
    }
  );
});

test("GET INTELLIGENCE: thread with 0 replies returns 200 not_enough_replies", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root with 0 replies", parentId: null, comments: 0, timestamp: new Date(0) },
  ]);
  const mockInsightModel = createMockInsightModel();

  const res = await getIntelligenceForPost(rootId, {
    tweetModel: mockTweetModel,
    insightModel: mockInsightModel,
  });

  assert.equal(res.status, "not_enough_replies");
  assert.equal(res.minimumReplies, 2);
  assert.equal(res.insight, undefined);
});

test("GET INTELLIGENCE: thread with 1 reply returns 200 not_enough_replies", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Single reply", parentId: rootId, timestamp: new Date(1000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root with 1 reply", parentId: null, comments: 1, timestamp: new Date(0) },
    r1,
  ]);
  const mockInsightModel = createMockInsightModel();

  const res = await getIntelligenceForPost(rootId, {
    tweetModel: mockTweetModel,
    insightModel: mockInsightModel,
  });

  assert.equal(res.status, "not_enough_replies");
  assert.equal(res.minimumReplies, 2);
});

test("GET INTELLIGENCE: thread with 2+ replies and no cached insight returns 200 none", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();

  const res = await getIntelligenceForPost(rootId, {
    tweetModel: mockTweetModel,
    insightModel: mockInsightModel,
  });

  assert.equal(res.status, "none");
  assert.equal(res.insight, undefined);
});

test("GET INTELLIGENCE: fresh cache returns 200 available with matching insight", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const rootPost = { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) };
  const mockTweetModel = createMockTweetModel([rootPost, r1, r2]);
  const mockInsightModel = createMockInsightModel();

  const fingerprint = computeSourceFingerprint(rootPost, [r1, r2]);
  await mockInsightModel.create({
    post: rootId,
    scopeKey: "public",
    status: "completed",
    fingerprint,
    overview: "Fresh overview",
    keyPoints: [{ statement: "Point 1", sourcePostIds: [r1._id] }],
    perspectives: [{ viewpoint: "Perspective 1", sourcePostIds: [r2._id] }],
    analyzedReplyCount: 2,
    latestReplyTimestamp: r2.timestamp,
  });

  const res = await getIntelligenceForPost(rootId, {
    tweetModel: mockTweetModel,
    insightModel: mockInsightModel,
  });

  assert.equal(res.status, "available");
  assert.equal(res.insight.overview, "Fresh overview");
  assert.equal(res.insight.status, "completed");
  assert.equal(res.insight.analyzedReplyCount, 2);
});

test("GET INTELLIGENCE: stale cache when new nested reply is added returns 200 stale", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const rootPost = { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) };

  // Cached insight was generated with only r1 and r2
  const oldFingerprint = computeSourceFingerprint(rootPost, [r1, r2]);
  const mockInsightModel = createMockInsightModel();
  await mockInsightModel.create({
    post: rootId,
    scopeKey: "public",
    status: "completed",
    fingerprint: oldFingerprint,
    overview: "Old cached overview",
    keyPoints: [{ statement: "Point 1", sourcePostIds: [r1._id] }],
    perspectives: [{ viewpoint: "Perspective 1", sourcePostIds: [r2._id] }],
    analyzedReplyCount: 2,
    latestReplyTimestamp: r2.timestamp,
  });

  // Now a nested reply (r3) is added under r1
  const r3 = { _id: new mongoose.Types.ObjectId(), content: "Nested reply under r1", parentId: r1._id, timestamp: new Date(3000) };
  const mockTweetModel = createMockTweetModel([rootPost, r1, r2, r3]);

  const res = await getIntelligenceForPost(rootId, {
    tweetModel: mockTweetModel,
    insightModel: mockInsightModel,
  });

  assert.equal(res.status, "stale");
  assert.equal(res.insight.overview, "Old cached overview");
  assert.equal(res.newRepliesCount, 1);
  assert.equal(res.sourceCountDifference, 1);
});

test("GET INTELLIGENCE: stale cache when reply is deleted returns 200 stale", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const rootPost = { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) };

  const oldFingerprint = computeSourceFingerprint(rootPost, [r1, r2]);
  const mockInsightModel = createMockInsightModel();
  await mockInsightModel.create({
    post: rootId,
    scopeKey: "public",
    status: "completed",
    fingerprint: oldFingerprint,
    overview: "Old cached overview",
    keyPoints: [{ statement: "Point 1", sourcePostIds: [r1._id] }],
    perspectives: [{ viewpoint: "Perspective 1", sourcePostIds: [r2._id] }],
    analyzedReplyCount: 2,
    latestReplyTimestamp: r2.timestamp,
  });

  // r2 is now soft-deleted
  const r2Deleted = { ...r2, deletedAt: new Date() };
  const r3 = { _id: new mongoose.Types.ObjectId(), content: "Reply 3", parentId: rootId, timestamp: new Date(2500) };
  const mockTweetModel = createMockTweetModel([rootPost, r1, r2Deleted, r3]);

  const res = await getIntelligenceForPost(rootId, {
    tweetModel: mockTweetModel,
    insightModel: mockInsightModel,
  });

  assert.equal(res.status, "stale");
  assert.equal(res.insight.overview, "Old cached overview");
});

test("GET INTELLIGENCE: strictly read-only and never invokes provider or mutates DB", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root post", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();

  let providerCalled = false;
  const mockProvider = {
    generateThreadInsight: async () => {
      providerCalled = true;
      throw new Error("Provider should not be called on GET");
    },
  };
  setIntelligenceProvider(mockProvider);

  try {
    const res = await getIntelligenceForPost(rootId, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
    });

    assert.equal(res.status, "none");
    assert.equal(providerCalled, false);
    // Ensure no record was created in the insight store
    assert.equal(mockInsightModel._store.size, 0);
  } finally {
    resetIntelligenceProvider();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. POST /post/:id/intelligence ENDPOINT TESTS (GENERATION & CACHE REUSE)
// ─────────────────────────────────────────────────────────────────────────────

test("POST INTELLIGENCE: rejects unknown post with 404 POST_NOT_FOUND", async () => {
  const mockTweetModel = createMockTweetModel([]);
  const mockInsightModel = createMockInsightModel();
  const unknownId = new mongoose.Types.ObjectId();

  await assert.rejects(
    async () => requestIntelligenceGeneration(unknownId, { _id: new mongoose.Types.ObjectId() }, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
    }),
    (err) => {
      assert.equal(err.code, "POST_NOT_FOUND");
      assert.equal(err.status, 404);
      return true;
    }
  );
});

test("POST INTELLIGENCE: rejects thread with fewer than 2 replies with 400 NOT_ENOUGH_REPLIES", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Single reply", parentId: rootId, timestamp: new Date(1000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root post", parentId: null, comments: 1, timestamp: new Date(0) },
    r1,
  ]);
  const mockInsightModel = createMockInsightModel();

  await assert.rejects(
    async () => requestIntelligenceGeneration(rootId, { _id: new mongoose.Types.ObjectId() }, {
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

test("POST INTELLIGENCE: first generation returns 201 isNew: true and persists insight", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();
  const userId = new mongoose.Types.ObjectId();

  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async () => ({ count: 1 });
  try {
    const res = await requestIntelligenceGeneration(rootId, { _id: userId }, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
      provider: new MockIntelligenceProvider(),
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, "available");
    assert.equal(res.body.fresh, true);
    assert.equal(res.body.isNew, true);
    assert.equal(res.body.insight.analyzedReplyCount, 2);

    // Verify stored in DB
    const stored = await mockInsightModel.findOne({ post: rootId, scopeKey: "public" });
    assert.equal(stored.status, "completed");
    assert.equal(stored.overview, res.body.insight.overview);
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

test("POST INTELLIGENCE: fresh cache hit returns 200 without calling provider or charging quota", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const rootPost = { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) };
  const mockTweetModel = createMockTweetModel([rootPost, r1, r2]);
  const mockInsightModel = createMockInsightModel();

  const fingerprint = computeSourceFingerprint(rootPost, [r1, r2]);
  await mockInsightModel.create({
    post: rootId,
    scopeKey: "public",
    status: "completed",
    fingerprint,
    overview: "Already fresh",
    keyPoints: [{ statement: "Point 1", sourcePostIds: [r1._id] }],
    perspectives: [{ viewpoint: "Perspective 1", sourcePostIds: [r2._id] }],
    analyzedReplyCount: 2,
    latestReplyTimestamp: r2.timestamp,
  });

  let providerCalled = false;
  const mockProvider = {
    generateThreadInsight: async () => { providerCalled = true; },
  };

  let throttleCalled = false;
  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async () => {
    throttleCalled = true;
    return { count: 1 };
  };

  try {
    const res = await requestIntelligenceGeneration(rootId, { _id: new mongoose.Types.ObjectId() }, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
      provider: mockProvider,
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "available");
    assert.equal(res.body.fresh, true);
    assert.equal(res.body.insight.overview, "Already fresh");
    assert.equal(providerCalled, false, "Provider must not be called on fresh cache");
    assert.equal(throttleCalled, false, "Throttle must not be consumed on fresh cache reuse");
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

test("POST INTELLIGENCE: stale cache triggers regeneration and returns 200 refreshed: true", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const rootPost = { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) };

  // Old cache with r1 and r2
  const oldFingerprint = computeSourceFingerprint(rootPost, [r1, r2]);
  const mockInsightModel = createMockInsightModel();
  await mockInsightModel.create({
    post: rootId,
    scopeKey: "public",
    status: "completed",
    fingerprint: oldFingerprint,
    overview: "Old overview",
    keyPoints: [{ statement: "Point 1", sourcePostIds: [r1._id] }],
    perspectives: [{ viewpoint: "Perspective 1", sourcePostIds: [r2._id] }],
    analyzedReplyCount: 2,
    latestReplyTimestamp: r2.timestamp,
  });

  // New reply r3 added
  const r3 = { _id: new mongoose.Types.ObjectId(), content: "Reply 3 added", parentId: rootId, timestamp: new Date(3000) };
  const mockTweetModel = createMockTweetModel([rootPost, r1, r2, r3]);

  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async () => ({ count: 1 });
  try {
    const res = await requestIntelligenceGeneration(rootId, { _id: new mongoose.Types.ObjectId() }, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
      provider: new MockIntelligenceProvider(),
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "available");
    assert.equal(res.body.fresh, true);
    assert.equal(res.body.refreshed, true);
    assert.equal(res.body.insight.analyzedReplyCount, 3);
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. CONCURRENCY TESTS (DB-BACKED LEASE)
// ─────────────────────────────────────────────────────────────────────────────

test("CONCURRENCY: simultaneous generation requests — exactly one provider invocation, second receives 409", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();

  let providerInvocations = 0;
  const slowProvider = {
    generateThreadInsight: async (ctx) => {
      providerInvocations++;
      // Simulate 50ms provider latency
      await new Promise(r => setTimeout(r, 50));
      return new MockIntelligenceProvider().generateThreadInsight(ctx);
    },
  };

  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async () => ({ count: 1 });

  try {
    // Launch Worker A and Worker B concurrently on the same post
    const promiseA = requestIntelligenceGeneration(rootId, { _id: new mongoose.Types.ObjectId() }, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
      provider: slowProvider,
    });

    // Small micro-tick to let Worker A acquire the lease
    await new Promise(r => setTimeout(r, 5));

    const promiseB = requestIntelligenceGeneration(rootId, { _id: new mongoose.Types.ObjectId() }, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
      provider: slowProvider,
    });

    const [resultA, resultB] = await Promise.allSettled([promiseA, promiseB]);

    // Worker A succeeds with 201
    assert.equal(resultA.status, "fulfilled");
    assert.equal(resultA.value.statusCode, 201);

    // Worker B fails with 409 INSIGHT_GENERATION_IN_PROGRESS
    assert.equal(resultB.status, "rejected");
    assert.equal(resultB.reason.code, "INSIGHT_GENERATION_IN_PROGRESS");
    assert.equal(resultB.reason.status, 409);

    // Exactly one provider invocation occurred
    assert.equal(providerInvocations, 1);
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. LEASE RECOVERY TESTS (EXPIRED LEASE RE-ACQUISITION)
// ─────────────────────────────────────────────────────────────────────────────

test("LEASE RECOVERY: expired lease from crashed process allows subsequent generation", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();

  // Simulate an abandoned lease that expired 10 seconds ago
  await mockInsightModel.create({
    post: rootId,
    scopeKey: "public",
    status: "generating",
    leaseExpiresAt: new Date(Date.now() - 10000),
  });

  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async () => ({ count: 1 });

  try {
    const res = await requestIntelligenceGeneration(rootId, { _id: new mongoose.Types.ObjectId() }, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
      provider: new MockIntelligenceProvider(),
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, "available");
    assert.equal(res.body.insight.status, "completed");
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

test("LEASE RECOVERY: active unexpired lease prevents concurrent generation (409)", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();

  // Active lease that expires in 25 seconds
  await mockInsightModel.create({
    post: rootId,
    scopeKey: "public",
    status: "generating",
    leaseExpiresAt: new Date(Date.now() + 25000),
  });

  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async () => ({ count: 1 });

  try {
    await assert.rejects(
      async () => requestIntelligenceGeneration(rootId, { _id: new mongoose.Types.ObjectId() }, {
        tweetModel: mockTweetModel,
        insightModel: mockInsightModel,
        provider: new MockIntelligenceProvider(),
      }),
      (err) => {
        assert.equal(err.code, "INSIGHT_GENERATION_IN_PROGRESS");
        assert.equal(err.status, 409);
        return true;
      }
    );
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. RATE LIMITING TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("RATE LIMIT: user generation limit enforces 10 attempts/hour; 11th receives 429", async () => {
  const mockInsightModel = createMockInsightModel();
  const userId = new mongoose.Types.ObjectId();

  const throttleCounts = new Map();
  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async (query, update) => {
    const id = query._id;
    let count = (throttleCounts.get(id) || 0) + (update.$inc?.count || 1);
    throttleCounts.set(id, count);
    return { count };
  };

  try {
    // Perform 10 allowed attempts on distinct posts to isolate user rate limit
    for (let i = 0; i < 10; i++) {
      const pId = new mongoose.Types.ObjectId();
      const rA = { _id: new mongoose.Types.ObjectId(), content: "Reply A", parentId: pId, timestamp: new Date(1000) };
      const rB = { _id: new mongoose.Types.ObjectId(), content: "Reply B", parentId: pId, timestamp: new Date(2000) };
      const tweetModel = createMockTweetModel([
        { _id: pId, content: `Root discussion ${i}`, parentId: null, comments: 2, timestamp: new Date(0) },
        rA, rB,
      ]);

      const res = await requestIntelligenceGeneration(pId, { _id: userId }, {
        tweetModel,
        insightModel: mockInsightModel,
        provider: new MockIntelligenceProvider(),
      });
      assert.equal(res.statusCode, 201);
    }

    // 11th attempt for the same user is throttled
    const pId11 = new mongoose.Types.ObjectId();
    const rA11 = { _id: new mongoose.Types.ObjectId(), content: "Reply A", parentId: pId11, timestamp: new Date(1000) };
    const rB11 = { _id: new mongoose.Types.ObjectId(), content: "Reply B", parentId: pId11, timestamp: new Date(2000) };
    const tweetModel11 = createMockTweetModel([
      { _id: pId11, content: "Root discussion 11", parentId: null, comments: 2, timestamp: new Date(0) },
      rA11, rB11,
    ]);

    await assert.rejects(
      async () => requestIntelligenceGeneration(pId11, { _id: userId }, {
        tweetModel: tweetModel11,
        insightModel: mockInsightModel,
        provider: new MockIntelligenceProvider(),
      }),
      (err) => {
        assert.equal(err.code, "THROTTLED");
        assert.equal(err.status, 429);
        return true;
      }
    );

    // Another user is NOT affected
    const otherUserId = new mongoose.Types.ObjectId();
    const otherRes = await requestIntelligenceGeneration(pId11, { _id: otherUserId }, {
      tweetModel: tweetModel11,
      insightModel: mockInsightModel,
      provider: new MockIntelligenceProvider(),
    });
    assert.equal(otherRes.statusCode, 201);
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

test("RATE LIMIT: post cooldown throttles rapid repeat attempts within 60 seconds", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();

  const throttleCounts = new Map();
  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async (query, update) => {
    const id = query._id;
    let count = (throttleCounts.get(id) || 0) + (update.$inc?.count || 1);
    throttleCounts.set(id, count);
    return { count };
  };

  try {
    // User A generates for post
    const resA = await requestIntelligenceGeneration(rootId, { _id: userA }, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
      provider: new MockIntelligenceProvider(),
    });
    assert.equal(resA.statusCode, 201);

    // Simulate post was changed so it's not a fresh cache hit
    mockInsightModel._store.clear();

    // User B attempts generation immediately on same post within 60s cooldown
    await assert.rejects(
      async () => requestIntelligenceGeneration(rootId, { _id: userB }, {
        tweetModel: mockTweetModel,
        insightModel: mockInsightModel,
        provider: new MockIntelligenceProvider(),
      }),
      (err) => {
        assert.equal(err.code, "THROTTLED");
        assert.equal(err.status, 429);
        return true;
      }
    );
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. PROVIDER TIMEOUT AND FAILURE TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("PROVIDER TIMEOUT: execution exceeding service timeout boundary throws 504 and marks lease failed", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();

  // Provider that takes longer than the timeout boundary
  const slowProvider = {
    generateThreadInsight: async (ctx) => {
      await new Promise(r => setTimeout(r, 100));
      return new MockIntelligenceProvider().generateThreadInsight(ctx);
    },
  };

  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async () => ({ count: 1 });

  try {
    await assert.rejects(
      async () => requestIntelligenceGeneration(rootId, { _id: new mongoose.Types.ObjectId() }, {
        tweetModel: mockTweetModel,
        insightModel: mockInsightModel,
        provider: slowProvider,
        timeoutMs: 20, // fast timeout for test
      }),
      (err) => {
        assert.equal(err.code, "INTELLIGENCE_PROVIDER_TIMEOUT");
        assert.equal(err.status, 504);
        return true;
      }
    );

    // Verify lease was safely released and marked failed
    const stored = await mockInsightModel.findOne({ post: rootId, scopeKey: "public" });
    assert.equal(stored.status, "failed");
    assert.equal(stored.leaseExpiresAt, null);
    assert.equal(stored.lastGenerationErrorCode, "INTELLIGENCE_PROVIDER_TIMEOUT");
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

test("PROVIDER FAILURE: provider error throws 502, marks lease failed, and leaves no corrupt cache", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();

  const failingProvider = {
    generateThreadInsight: async () => {
      throw new Error("Raw upstream AI engine error with secret: sk-12345");
    },
  };

  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async () => ({ count: 1 });

  try {
    await assert.rejects(
      async () => requestIntelligenceGeneration(rootId, { _id: new mongoose.Types.ObjectId() }, {
        tweetModel: mockTweetModel,
        insightModel: mockInsightModel,
        provider: failingProvider,
      }),
      (err) => {
        assert.equal(err.code, "INTELLIGENCE_PROVIDER_UNAVAILABLE");
        assert.equal(err.status, 502);
        // Ensure raw secrets/message are not exposed in client error
        assert.equal(err.message.includes("sk-12345"), false);
        return true;
      }
    );

    const stored = await mockInsightModel.findOne({ post: rootId, scopeKey: "public" });
    assert.equal(stored.status, "failed");
    assert.equal(stored.overview, undefined);
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

test("PROVIDER FAILURE: grounding failure throws 422 and marks lease failed", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();

  const ungroundedProvider = {
    generateThreadInsight: async () => ({
      overview: "Hallucinated summary",
      keyPoints: [{ statement: "Fake point", sourcePostIds: [new mongoose.Types.ObjectId()] }], // Not in thread!
      perspectives: [{ viewpoint: "Fake perspective", sourcePostIds: [r1._id] }],
    }),
  };

  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async () => ({ count: 1 });

  try {
    await assert.rejects(
      async () => requestIntelligenceGeneration(rootId, { _id: new mongoose.Types.ObjectId() }, {
        tweetModel: mockTweetModel,
        insightModel: mockInsightModel,
        provider: ungroundedProvider,
      }),
      (err) => {
        assert.equal(err.code, "INSIGHT_GROUNDING_FAILED");
        assert.equal(err.status, 422);
        return true;
      }
    );

    const stored = await mockInsightModel.findOne({ post: rootId, scopeKey: "public" });
    assert.equal(stored.status, "failed");
    assert.equal(stored.lastGenerationErrorCode, "INSIGHT_GROUNDING_FAILED");
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

test("PROVIDER RECOVERY: future retry after failure successfully re-acquires lease and completes", async () => {
  const rootId = new mongoose.Types.ObjectId();
  const r1 = { _id: new mongoose.Types.ObjectId(), content: "Reply 1", parentId: rootId, timestamp: new Date(1000) };
  const r2 = { _id: new mongoose.Types.ObjectId(), content: "Reply 2", parentId: rootId, timestamp: new Date(2000) };
  const mockTweetModel = createMockTweetModel([
    { _id: rootId, content: "Root discussion", parentId: null, comments: 2, timestamp: new Date(0) },
    r1, r2,
  ]);
  const mockInsightModel = createMockInsightModel();

  // Document was marked failed from a prior attempt
  await mockInsightModel.create({
    post: rootId,
    scopeKey: "public",
    status: "failed",
    leaseExpiresAt: null,
    lastGenerationErrorCode: "INTELLIGENCE_PROVIDER_UNAVAILABLE",
  });

  const origThrottle = Throttle.findOneAndUpdate;
  Throttle.findOneAndUpdate = async () => ({ count: 1 });

  try {
    const res = await requestIntelligenceGeneration(rootId, { _id: new mongoose.Types.ObjectId() }, {
      tweetModel: mockTweetModel,
      insightModel: mockInsightModel,
      provider: new MockIntelligenceProvider(),
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, "available");
    assert.equal(res.body.insight.status, "completed");

    const stored = await mockInsightModel.findOne({ post: rootId, scopeKey: "public" });
    assert.equal(stored.status, "completed");
    assert.equal(stored.lastGenerationErrorCode, null);
  } finally {
    Throttle.findOneAndUpdate = origThrottle;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. HTTP API AND SECURITY BOUNDARY TESTS (EXPRESS BOUNDARY INTEGRATION)
// ─────────────────────────────────────────────────────────────────────────────

test("HTTP API & BOUNDARY: verification of GET and POST endpoints with security checks", async () => {
  const { app, securityDependencies } = await import("../index.js");
  const User = (await import("../models/user.js")).default;
  const Tweet = (await import("../models/tweet.js")).default;
  const LoginSession = (await import("../models/loginSession.js")).default;
  const { sessionId } = await import("../security.js");

  const server = app.listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const testUserId = new mongoose.Types.ObjectId();
  const testToken = { uid: "test-intelligence-user", email: "intel@example.test", auth_time: 100, email_verified: true };
  const testSessionKey = sessionId(testToken);

  // Mocks for DB models during HTTP integration
  const origUserFindOne = User.findOne;
  const origSessionFindById = LoginSession.findById;
  const origVerifyToken = securityDependencies.verifyToken;
  const origThrottle = Throttle.findOneAndUpdate;

  Throttle.findOneAndUpdate = async () => ({ count: 1 });
  securityDependencies.verifyToken = async (cred) => {
    if (cred === "valid-token") return testToken;
    throw new Error("Invalid token");
  };

  User.findOne = async (query) => {
    if (query.firebaseUid === testToken.uid || query.email === testToken.email) {
      return {
        _id: testUserId,
        firebaseUid: testToken.uid,
        email: testToken.email,
        username: "inteluser",
        displayName: "Intelligence User",
      };
    }
    return null;
  };

  let sessionStatus = "verified";
  LoginSession.findById = async (id) => {
    if (id === testSessionKey) {
      return {
        _id: testSessionKey,
        uid: testToken.uid,
        status: sessionStatus,
        expiresAt: new Date(Date.now() + 3600000),
      };
    }
    return null;
  };

  try {
    // 1. GET with invalid post ID format -> 400 INVALID_POST_ID
    const getInvalidId = await fetch(`${base}/post/invalid-hex-format/intelligence`);
    assert.equal(getInvalidId.status, 400);
    const getInvalidIdData = await getInvalidId.json();
    assert.equal(getInvalidIdData.code, "INVALID_POST_ID");

    // 2. POST unauthenticated -> 401 AUTH_REQUIRED
    const validPostHex = new mongoose.Types.ObjectId().toString();
    const postUnauth = await fetch(`${base}/post/${validPostHex}/intelligence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(postUnauth.status, 401);
    const postUnauthData = await postUnauth.json();
    assert.equal(postUnauthData.code, "AUTH_REQUIRED");

    // 3. POST with invalid bearer token -> 401 INVALID_TOKEN
    const postBadToken = await fetch(`${base}/post/${validPostHex}/intelligence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer expired-token",
      },
    });
    assert.equal(postBadToken.status, 401);
    const postBadTokenData = await postBadToken.json();
    assert.equal(postBadTokenData.code, "INVALID_TOKEN");

    // 4. POST with unverified session -> 403 OTP_REQUIRED
    sessionStatus = "pending";
    const postUnverified = await fetch(`${base}/post/${validPostHex}/intelligence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
    });
    assert.equal(postUnverified.status, 403);
    const postUnverifiedData = await postUnverified.json();
    assert.equal(postUnverifiedData.code, "OTP_REQUIRED");
    sessionStatus = "verified";

    // 5. POST with invalid post ID format -> 400 INVALID_POST_ID
    const postInvalidId = await fetch(`${base}/post/not-a-valid-post-id/intelligence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
    });
    assert.equal(postInvalidId.status, 400);
    const postInvalidIdData = await postInvalidId.json();
    assert.equal(postInvalidIdData.code, "INVALID_POST_ID");

    // 6. POST attempting to inject forbidden client parameters -> 400 INVALID_INPUT
    const postClientInjection = await fetch(`${base}/post/${validPostHex}/intelligence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({
        sourcePostIds: ["111111111111111111111111"],
        viewerId: "222222222222222222222222",
        rootContext: "fakeContext",
      }),
    });
    assert.equal(postClientInjection.status, 400);
    const postClientInjectionData = await postClientInjection.json();
    assert.equal(postClientInjectionData.code, "INVALID_INPUT");
  } finally {
    User.findOne = origUserFindOne;
    LoginSession.findById = origSessionFindById;
    securityDependencies.verifyToken = origVerifyToken;
    Throttle.findOneAndUpdate = origThrottle;
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
});
