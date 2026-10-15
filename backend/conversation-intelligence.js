import crypto from "crypto";
import mongoose from "mongoose";
import Tweet from "./models/tweet.js";
import ConversationInsight from "./models/conversationInsight.js";
import { MockIntelligenceProvider } from "./intelligence-provider.js";

export const MAX_ANALYZED_REPLIES = 50;
export const MIN_ANALYSIS_REPLIES = 2;
export const MAX_TRAVERSAL_DEPTH = 8;
export const LEASE_DURATION_MS = 30000;

/**
 * Collect bounded descendant replies for a root post.
 * Implements level-by-level breadth-first traversal up to MAX_ANALYZED_REPLIES.
 * Supports arbitrary nested reply trees without unbounded recursive queries.
 *
 * @param {string|mongoose.Types.ObjectId} rootPostId
 * @param {Object} [options]
 * @param {number} [options.maxReplies=50]
 * @param {number} [options.maxDepth=8]
 * @param {Function} [options.tweetModel=Tweet]
 * @returns {Promise<{ rootPost: Object, sources: Array<Object>, activeSources: Array<Object> }>}
 */
export async function collectBoundedThreadSources(rootPostId, options = {}) {
  const maxReplies = options.maxReplies || MAX_ANALYZED_REPLIES;
  const maxDepth = options.maxDepth || MAX_TRAVERSAL_DEPTH;
  const TweetModel = options.tweetModel || Tweet;

  const rootPost = await TweetModel.findById(rootPostId);
  if (!rootPost || rootPost.deletedAt) {
    const error = new Error("Root post is unavailable or deleted");
    error.code = "ROOT_POST_UNAVAILABLE";
    error.status = 404;
    throw error;
  }

  const collectedMap = new Map();
  let currentLevelParents = [rootPost._id];
  let depth = 0;

  while (currentLevelParents.length > 0 && collectedMap.size < maxReplies && depth < maxDepth) {
    depth++;
    const children = await TweetModel.find({ parentId: { $in: currentLevelParents } })
      .sort({ timestamp: 1, _id: 1 })
      .lean();

    if (!children.length) break;

    const nextLevelParents = [];
    for (const child of children) {
      const childId = String(child._id);
      if (!collectedMap.has(childId)) {
        collectedMap.set(childId, child);
        // Even tombstoned replies can have living descendants
        nextLevelParents.push(child._id);
        if (collectedMap.size >= maxReplies) break;
      }
    }

    currentLevelParents = nextLevelParents;
  }

  // Sort all collected sources deterministically by timestamp ASC, _id ASC
  const allSources = Array.from(collectedMap.values()).sort((a, b) => {
    const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;
    return String(a._id).localeCompare(String(b._id));
  }).slice(0, maxReplies);

  const activeSources = allSources.filter(s => !s.deletedAt);

  return {
    rootPost,
    sources: allSources,
    activeSources,
  };
}

/**
 * Compute a deterministic cryptographic fingerprint of the exact visible source set.
 * Captures root identity, comments count, plus every source post's ID, timestamp, and deletion state.
 *
 * @param {Object} rootPost
 * @param {Array<Object>} sources
 * @returns {string} SHA-256 hex digest
 */
export function computeSourceFingerprint(rootPost, sources = []) {
  const hash = crypto.createHash("sha256");

  // Root post component
  const rootId = String(rootPost._id);
  const rootTime = new Date(rootPost.timestamp || 0).toISOString();
  const rootComments = Number(rootPost.comments || 0);
  hash.update(`ROOT:${rootId}:${rootTime}:${rootComments}\n`);

  // Defensively ensure deterministic chronological order
  const sortedSources = [...sources].sort((a, b) => {
    const timeDiff = new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime();
    if (timeDiff !== 0) return timeDiff;
    return String(a._id).localeCompare(String(b._id));
  });

  // Sources in deterministic order
  for (const source of sortedSources) {
    const sId = String(source._id);
    const sTime = new Date(source.timestamp || 0).toISOString();
    const isDeleted = Boolean(source.deletedAt || source.deleted);
    hash.update(`SRC:${sId}:${sTime}:${isDeleted ? "deleted" : "active"}\n`);
  }

  return hash.digest("hex");
}

/**
 * Validate grounding of generated insights.
 * Requires:
 * - Structured output (overview, keyPoints, perspectives)
 * - Every keyPoint and perspective must have non-empty sourcePostIds
 * - Every sourcePostId must exist in the active visible sources
 * - Any ungrounded/hallucinated citation throws INSIGHT_GROUNDING_FAILED
 *
 * @param {Object} insight
 * @param {Set<string>|Array<string>} validSourceIds
 * @returns {Object} validated and normalized insight
 */
export function validateInsightGrounding(insight, validSourceIds) {
  const validIdSet = validSourceIds instanceof Set
    ? validSourceIds
    : new Set((validSourceIds || []).map(String));

  if (!insight || typeof insight !== "object") {
    const err = new Error("Malformed insight: expected an object");
    err.code = "INSIGHT_GROUNDING_FAILED";
    err.status = 422;
    throw err;
  }

  const overview = String(insight.overview || "").trim();
  if (!overview || overview.length > 500) {
    const err = new Error("Insight overview must be a non-empty string under 500 characters");
    err.code = "INSIGHT_GROUNDING_FAILED";
    err.status = 422;
    throw err;
  }

  if (!Array.isArray(insight.keyPoints) || insight.keyPoints.length === 0) {
    const err = new Error("Insight keyPoints must be a non-empty array");
    err.code = "INSIGHT_GROUNDING_FAILED";
    err.status = 422;
    throw err;
  }

  if (!Array.isArray(insight.perspectives) || insight.perspectives.length === 0) {
    const err = new Error("Insight perspectives must be a non-empty array");
    err.code = "INSIGHT_GROUNDING_FAILED";
    err.status = 422;
    throw err;
  }

  const validatedKeyPoints = [];
  for (const kp of insight.keyPoints) {
    const statement = String(kp?.statement || "").trim();
    if (!statement || statement.length > 300) {
      const err = new Error("Key point statement must be non-empty and under 300 characters");
      err.code = "INSIGHT_GROUNDING_FAILED";
      err.status = 422;
      throw err;
    }

    const rawIds = Array.isArray(kp?.sourcePostIds) ? kp.sourcePostIds : [];
    if (!rawIds.length) {
      const err = new Error(`Key point "${statement.slice(0, 30)}" missing required source citations`);
      err.code = "INSIGHT_GROUNDING_FAILED";
      err.status = 422;
      throw err;
    }

    const uniqueRawIds = [...new Set(rawIds.map(String))];
    const citationIds = [];
    for (const idStr of uniqueRawIds) {
      if (!validIdSet.has(idStr)) {
        const err = new Error(`Key point cites invalid or ungrounded post ID: ${idStr}`);
        err.code = "INSIGHT_GROUNDING_FAILED";
        err.status = 422;
        throw err;
      }
      citationIds.push(new mongoose.Types.ObjectId(idStr));
    }

    validatedKeyPoints.push({
      statement,
      sourcePostIds: citationIds,
    });
  }

  const validatedPerspectives = [];
  for (const p of insight.perspectives) {
    const viewpoint = String(p?.viewpoint || "").trim();
    if (!viewpoint || viewpoint.length > 300) {
      const err = new Error("Perspective viewpoint must be non-empty and under 300 characters");
      err.code = "INSIGHT_GROUNDING_FAILED";
      err.status = 422;
      throw err;
    }

    const rawIds = Array.isArray(p?.sourcePostIds) ? p.sourcePostIds : [];
    if (!rawIds.length) {
      const err = new Error(`Perspective "${viewpoint.slice(0, 30)}" missing required source citations`);
      err.code = "INSIGHT_GROUNDING_FAILED";
      err.status = 422;
      throw err;
    }

    const uniqueRawIds = [...new Set(rawIds.map(String))];
    const citationIds = [];
    for (const idStr of uniqueRawIds) {
      if (!validIdSet.has(idStr)) {
        const err = new Error(`Perspective cites invalid or ungrounded post ID: ${idStr}`);
        err.code = "INSIGHT_GROUNDING_FAILED";
        err.status = 422;
        throw err;
      }
      citationIds.push(new mongoose.Types.ObjectId(idStr));
    }

    validatedPerspectives.push({
      viewpoint,
      sourcePostIds: citationIds,
    });
  }

  return {
    overview,
    keyPoints: validatedKeyPoints,
    perspectives: validatedPerspectives,
    model: String(insight.model || "mock-v1"),
  };
}

/**
 * Acquire a DB-backed atomic generation lease.
 * Controls concurrency across multiple processes and instances.
 *
 * @param {string|mongoose.Types.ObjectId} postId
 * @param {string} [scopeKey="public"]
 * @param {string|mongoose.Types.ObjectId} [generatedBy]
 * @param {number} [leaseDurationMs=30000]
 * @param {Function} [insightModel=ConversationInsight]
 * @returns {Promise<{ acquired: boolean, record: Object }>}
 */
export async function acquireGenerationLease(postId, options = {}) {
  const scopeKey = options.scopeKey || "public";
  const generatedBy = options.generatedBy || null;
  const leaseDurationMs = options.leaseDurationMs || LEASE_DURATION_MS;
  const InsightModel = options.insightModel || ConversationInsight;

  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  const existing = await InsightModel.findOne({ post: postId, scopeKey });
  if (existing) {
    if (existing.status === "generating" && existing.leaseExpiresAt && existing.leaseExpiresAt >= now) {
      return { acquired: false, record: existing };
    }

    const updated = await InsightModel.findOneAndUpdate(
      {
        post: postId,
        scopeKey,
        $or: [
          { status: { $ne: "generating" } },
          { leaseExpiresAt: { $lt: now } },
        ],
      },
      {
        $set: {
          status: "generating",
          leaseExpiresAt,
          generatedBy,
        },
      },
      { new: true }
    );

    if (updated) {
      return { acquired: true, record: updated };
    }

    const latest = await InsightModel.findOne({ post: postId, scopeKey });
    return { acquired: false, record: latest };
  }

  try {
    const created = await InsightModel.create({
      post: postId,
      scopeKey,
      status: "generating",
      leaseExpiresAt,
      generatedBy,
    });
    return { acquired: true, record: created };
  } catch (err) {
    if (err.code === 11000) {
      const raceExisting = await InsightModel.findOne({ post: postId, scopeKey });
      return { acquired: false, record: raceExisting };
    }
    throw err;
  }
}

/**
 * Commit validated insight and release generation lease.
 */
export async function commitInsight(postId, scopeKey, insightData, options = {}) {
  const InsightModel = options.insightModel || ConversationInsight;
  return await InsightModel.findOneAndUpdate(
    { post: postId, scopeKey },
    {
      $set: {
        status: "completed",
        leaseExpiresAt: null,
        fingerprint: insightData.fingerprint,
        overview: insightData.overview,
        keyPoints: insightData.keyPoints,
        perspectives: insightData.perspectives,
        analyzedReplyCount: insightData.analyzedReplyCount,
        latestReplyTimestamp: insightData.latestReplyTimestamp,
        generatedAt: new Date(),
        model: insightData.model || "mock-v1",
      },
    },
    { new: true }
  );
}

/**
 * Release generation lease upon failure.
 */
export async function failInsightLease(postId, scopeKey, options = {}) {
  const InsightModel = options.insightModel || ConversationInsight;
  return await InsightModel.findOneAndUpdate(
    { post: postId, scopeKey },
    {
      $set: {
        status: "failed",
        leaseExpiresAt: null,
      },
    },
    { new: true }
  );
}

/**
 * Execute conversation intelligence generation workflow.
 *
 * @param {string|mongoose.Types.ObjectId} rootPostId
 * @param {Object} [options]
 * @param {IntelligenceProvider} [options.provider]
 * @param {string} [options.scopeKey="public"]
 * @param {string|mongoose.Types.ObjectId} [options.generatedBy]
 * @returns {Promise<Object>}
 */
export async function generateConversationIntelligence(rootPostId, options = {}) {
  const provider = options.provider || new MockIntelligenceProvider();
  const scopeKey = options.scopeKey || "public";
  const generatedBy = options.generatedBy || null;

  // 1. Collect sources with bounded descendant traversal
  const { rootPost, sources, activeSources } = await collectBoundedThreadSources(rootPostId, options);

  if (activeSources.length < MIN_ANALYSIS_REPLIES) {
    const err = new Error(`Thread has ${activeSources.length} replies; minimum ${MIN_ANALYSIS_REPLIES} required for intelligence`);
    err.code = "NOT_ENOUGH_REPLIES";
    err.status = 400;
    throw err;
  }

  // 2. Compute deterministic source fingerprint
  const fingerprint = computeSourceFingerprint(rootPost, sources);

  // 3. Check for existing cached completed insight with identical fingerprint
  const InsightModel = options.insightModel || ConversationInsight;
  const cached = await InsightModel.findOne({ post: rootPost._id, scopeKey });
  if (cached && cached.status === "completed" && cached.fingerprint === fingerprint) {
    return {
      insight: cached,
      fresh: true,
      sourceCount: activeSources.length,
    };
  }

  // 4. Acquire atomic lease
  const leaseResult = await acquireGenerationLease(rootPost._id, {
    scopeKey,
    generatedBy,
    insightModel: InsightModel,
  });

  if (!leaseResult.acquired) {
    // Another worker is actively generating; return current in-progress record
    return {
      insight: leaseResult.record,
      generating: true,
      sourceCount: activeSources.length,
    };
  }

  try {
    // 5. Invoke intelligence provider
    const generated = await provider.generateThreadInsight({
      rootPost,
      sources: activeSources,
      topicContext: rootPost.topics,
      circleContext: rootPost.circle,
    });

    // 6. Validate grounding
    const validSourceIds = new Set(activeSources.map(s => String(s._id)));
    const validated = validateInsightGrounding(generated, validSourceIds);

    // 7. Commit to DB
    const latestReply = activeSources[activeSources.length - 1];
    const committed = await commitInsight(rootPost._id, scopeKey, {
      ...validated,
      fingerprint,
      analyzedReplyCount: activeSources.length,
      latestReplyTimestamp: latestReply.timestamp,
    }, { insightModel: InsightModel });

    return {
      insight: committed,
      fresh: true,
      sourceCount: activeSources.length,
    };
  } catch (err) {
    await failInsightLease(rootPost._id, scopeKey, { insightModel: InsightModel });
    throw err;
  }
}
