import Tweet from "./models/tweet.js";
import Topic, { TOPIC_FIELDS } from "./models/topic.js";
import TopicFollow from "./models/topicFollow.js";
import Circle, { CIRCLE_FIELDS } from "./models/circle.js";
import CircleMembership from "./models/circleMembership.js";
import { cursorFilter, pageResult } from "./pagination.js";
import { fail, PUBLIC_USER_FIELDS } from "./security.js";
import { getActiveRules } from "./feed-rules-operations.js";
import mongoose from "mongoose";
import crypto from "crypto";

export const FEED_MODES = ["foryou", "following", "topics", "circles"];
export const WEIGHTED_RULE_TYPES = ["boost_topic", "reduce_topic", "prioritize_circle"];

export function resolveFeedMode(query = {}) {
  if (query.mode && query.type && query.mode !== query.type) {
    fail(400, "FEED_MODE_CONFLICT", "Conflicting feed mode and legacy type parameters");
  }
  const mode = query.mode || query.type || "foryou";
  if (!FEED_MODES.includes(mode)) {
    fail(400, "INVALID_FEED_MODE", `Invalid feed mode. Choose from: ${FEED_MODES.join(", ")}`);
  }
  return mode;
}

/**
 * Deterministic feed-state fingerprint covering Feed Mode and active rules
 */
export function calculateFeedFingerprint(mode, rules = []) {
  const normalized = (rules || [])
    .map(r => `${r.ruleType}:${r.targetType || ""}:${r.target?._id || r.target || ""}`)
    .sort()
    .join(";");
  return crypto.createHash("sha256").update(`${mode}|${normalized}`).digest("hex").slice(0, 16);
}

/**
 * Decode and strictly validate a score-aware cursor
 */
export function decodeScoreCursor(cursorStr) {
  try {
    if (typeof cursorStr !== "string" || cursorStr.length > 250 || !/^[A-Za-z0-9_-]+$/.test(cursorStr)) {
      throw Error();
    }
    const data = JSON.parse(Buffer.from(cursorStr, "base64url").toString());
    if (typeof data !== "object" || data === null) throw Error();
    if (!/^[a-f\d]{24}$/i.test(data.id) || typeof data.t !== "string" || new Date(data.t).toISOString() !== data.t) {
      throw Error();
    }
    const score = typeof data.s === "number" && Number.isFinite(data.s) ? data.s : 0;
    return { id: data.id, t: new Date(data.t), s: score, fp: typeof data.fp === "string" ? data.fp : null };
  } catch {
    fail(400, "INVALID_CURSOR", "Invalid continuation cursor");
  }
}

/**
 * Encode a score-aware cursor
 */
export function encodeScoreCursor(row, feedScore, fingerprint) {
  return Buffer.from(JSON.stringify({
    s: typeof feedScore === "number" ? feedScore : 0,
    t: new Date(row.timestamp).toISOString(),
    id: String(row._id),
    fp: fingerprint,
  })).toString("base64url");
}

export async function getFeed(principal, query = {}) {
  const mode = resolveFeedMode(query);
  const limit = Math.max(1, Math.min(Number(query.limit || 20), 100));

  // Determine active feed rules for authenticated principals
  let activeRules = [];
  if (principal?._id) {
    activeRules = await getActiveRules(principal._id);
  }

  const hasWeightedRules = activeRules.some(r => WEIGHTED_RULE_TYPES.includes(r.ruleType));
  const currentFingerprint = calculateFeedFingerprint(mode, activeRules);

  // Construct base query constraints (top-level, non-deleted)
  const baseQuery = {
    parentId: null,
    deletedAt: null,
  };

  // Only apply legacy timestamp cursor directly to baseQuery if NO weighted rules are active
  if (!hasWeightedRules && query.cursor) {
    Object.assign(baseQuery, cursorFilter(query.cursor, "timestamp"));
  }

  // 1. Determine Feed Mode eligibility
  if (mode === "following") {
    if (!principal) fail(401, "AUTH_REQUIRED", "Please sign in to view your following feed");
    const authorIds = [...(principal.following || []), principal._id];
    baseQuery.author = { $in: authorIds };
  } else if (mode === "topics") {
    if (!principal) fail(401, "AUTH_REQUIRED", "Please sign in to view your topics feed");
    const follows = await TopicFollow.find({ user: principal._id }).select("topic").lean();
    const topicIds = follows.map(f => f.topic);
    if (!topicIds.length) {
      return { tweets: [], hasMore: false, nextCursor: null, page: Number(query.page || 1), mode, activeRulesCount: activeRules.length };
    }
    const activeTopics = await Topic.find({ _id: { $in: topicIds }, status: "active" }).select("_id").lean();
    const activeTopicIds = activeTopics.map(t => t._id);
    if (!activeTopicIds.length) {
      return { tweets: [], hasMore: false, nextCursor: null, page: Number(query.page || 1), mode, activeRulesCount: activeRules.length };
    }
    baseQuery.topics = { $in: activeTopicIds };
  } else if (mode === "circles") {
    if (!principal) fail(401, "AUTH_REQUIRED", "Please sign in to view your circles feed");
    const memberships = await CircleMembership.find({ user: principal._id }).select("circle").lean();
    const circleIds = memberships.map(m => m.circle);
    if (!circleIds.length) {
      return { tweets: [], hasMore: false, nextCursor: null, page: Number(query.page || 1), mode, activeRulesCount: activeRules.length };
    }
    const activeCircles = await Circle.find({ _id: { $in: circleIds }, status: "active" }).select("_id").lean();
    const activeCircleIds = activeCircles.map(c => c._id);
    if (!activeCircleIds.length) {
      return { tweets: [], hasMore: false, nextCursor: null, page: Number(query.page || 1), mode, activeRulesCount: activeRules.length };
    }
    baseQuery.circle = { $in: activeCircleIds };
  }

  // 2. Apply Batch 4B Narrowing Filter Rules
  if (principal?._id && activeRules.length > 0) {
    // Rule: only_following
    if (activeRules.some(r => r.ruleType === "only_following")) {
      const allowedAuthors = [...(principal.following || []), principal._id];
      baseQuery.author = { $in: allowedAuthors };
    }

    // Rule: hide_topic
    const hiddenTopicIds = activeRules
      .filter(r => r.ruleType === "hide_topic" && r.target)
      .map(r => r.target._id || r.target);
    if (hiddenTopicIds.length > 0) {
      if (baseQuery.topics) {
        baseQuery.topics.$nin = hiddenTopicIds;
      } else {
        baseQuery.topics = { $nin: hiddenTopicIds };
      }
    }

    // Rule: hide_media
    if (activeRules.some(r => r.ruleType === "hide_media")) {
      baseQuery.image = { $in: [null, ""] };
      baseQuery.audio = { $in: [null, ""] };
    }
  }

  // 3. Execution: If Weighted Rules Are Active -> Score-aware aggregation pipeline
  if (hasWeightedRules) {
    // Validate cursor & check feed configuration fingerprint
    let cursorMatch = null;
    if (query.cursor) {
      const decodedCursor = decodeScoreCursor(query.cursor);
      if (decodedCursor.fp && decodedCursor.fp !== currentFingerprint) {
        fail(400, "STALE_FEED_CURSOR", "Feed configuration changed; please refresh feed");
      }
      const cScore = decodedCursor.s;
      const cTime = decodedCursor.t;
      const cId = new mongoose.Types.ObjectId(decodedCursor.id);

      cursorMatch = {
        $or: [
          { feedScore: { $lt: cScore } },
          { feedScore: cScore, timestamp: { $lt: cTime } },
          { feedScore: cScore, timestamp: cTime, _id: { $lt: cId } },
        ],
      };
    }

    if (mongoose.connection.readyState === 0 && Tweet.aggregate === mongoose.Model.aggregate) {
      return {
        tweets: [],
        hasMore: false,
        nextCursor: null,
        page: Number(query.page || 1),
        mode,
        activeRulesCount: activeRules.length,
      };
    }

    // Extract target IDs for scoring
    const boostTopicIds = activeRules
      .filter(r => r.ruleType === "boost_topic" && r.target)
      .map(r => new mongoose.Types.ObjectId(r.target._id || r.target));
    const reduceTopicIds = activeRules
      .filter(r => r.ruleType === "reduce_topic" && r.target)
      .map(r => new mongoose.Types.ObjectId(r.target._id || r.target));
    const circleRuleIds = activeRules
      .filter(r => r.ruleType === "prioritize_circle" && r.target)
      .map(r => new mongoose.Types.ObjectId(r.target._id || r.target));

    // For prioritize_circle, verify caller is currently a member
    let validPrioritizeCircleIds = [];
    if (circleRuleIds.length > 0) {
      const activeMemberships = await CircleMembership.find({
        user: principal._id,
        circle: { $in: circleRuleIds },
      }).select("circle").lean();
      validPrioritizeCircleIds = activeMemberships.map(m => m.circle);
    }

    // Construct additive feedScore expression
    const scoreAddends = [0];
    for (const tid of boostTopicIds) {
      scoreAddends.push({ $cond: [{ $in: [tid, { $ifNull: ["$topics", []] }] }, 2, 0] });
    }
    for (const tid of reduceTopicIds) {
      scoreAddends.push({ $cond: [{ $in: [tid, { $ifNull: ["$topics", []] }] }, -2, 0] });
    }
    for (const cid of validPrioritizeCircleIds) {
      scoreAddends.push({ $cond: [{ $eq: ["$circle", cid] }, 3, 0] });
    }

    const pipeline = [
      { $match: baseQuery },
      { $addFields: { feedScore: { $add: scoreAddends } } },
      ...(cursorMatch ? [{ $match: cursorMatch }] : []),
      { $sort: { feedScore: -1, timestamp: -1, _id: -1 } },
      { $limit: limit + 1 },
    ];

    const agg = Tweet.aggregate(pipeline);
    if (typeof agg.option === "function") {
      agg.option({ maxTimeMS: 5000 });
    }
    const rawRows = await agg;

    const hasMore = rawRows.length > limit;
    const items = rawRows.slice(0, limit);
    const nextCursor = hasMore && items.length > 0
      ? encodeScoreCursor(items[items.length - 1], items[items.length - 1].feedScore, currentFingerprint)
      : null;

    if (typeof Tweet.populate === "function") {
      await Tweet.populate(items, [
        { path: "author", select: PUBLIC_USER_FIELDS },
        { path: "topics", select: TOPIC_FIELDS, match: { status: "active" } },
        { path: "circle", select: CIRCLE_FIELDS, match: { status: "active" } },
      ]);
    }

    const serializedTweets = items.map(item => {
      try {
        return new Tweet(item).toJSON();
      } catch {
        return item;
      }
    });

    return {
      tweets: serializedTweets,
      hasMore,
      nextCursor,
      page: Number(query.page || 1),
      mode,
      activeRulesCount: activeRules.length,
    };
  }

  // 4. Execution: When NO Weighted Rules Are Active -> Standard fast find with timestamp sort
  const rows = await Tweet.find(baseQuery)
    .sort({ timestamp: -1, _id: -1 })
    .skip(query.cursor ? 0 : (Number(query.page || 1) - 1) * limit)
    .limit(limit + 1)
    .populate("author", PUBLIC_USER_FIELDS);

  const result = pageResult(rows, limit, "timestamp");
  return {
    tweets: result.items,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
    page: Number(query.page || 1),
    mode,
    activeRulesCount: principal?._id ? activeRules.length : 0,
  };
}
