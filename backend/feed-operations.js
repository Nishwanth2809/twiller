import Tweet from "./models/tweet.js";
import Topic from "./models/topic.js";
import TopicFollow from "./models/topicFollow.js";
import Circle from "./models/circle.js";
import CircleMembership from "./models/circleMembership.js";
import { cursorFilter, pageResult } from "./pagination.js";
import { fail, PUBLIC_USER_FIELDS } from "./security.js";

export const FEED_MODES = ["foryou", "following", "topics", "circles"];

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

export async function getFeed(principal, query = {}) {
  const mode = resolveFeedMode(query);
  const limit = Math.max(1, Math.min(Number(query.limit || 20), 100));
  const baseQuery = {
    parentId: null,
    deletedAt: null,
    ...cursorFilter(query.cursor, "timestamp"),
  };

  if (mode === "following") {
    if (!principal) fail(401, "AUTH_REQUIRED", "Please sign in to view your following feed");
    const authorIds = [...(principal.following || []), principal._id];
    baseQuery.author = { $in: authorIds };
  } else if (mode === "topics") {
    if (!principal) fail(401, "AUTH_REQUIRED", "Please sign in to view your topics feed");
    const follows = await TopicFollow.find({ user: principal._id }).select("topic").lean();
    const topicIds = follows.map(f => f.topic);
    if (!topicIds.length) {
      return { tweets: [], hasMore: false, nextCursor: null, page: Number(query.page || 1), mode };
    }
    const activeTopics = await Topic.find({ _id: { $in: topicIds }, status: "active" }).select("_id").lean();
    const activeTopicIds = activeTopics.map(t => t._id);
    if (!activeTopicIds.length) {
      return { tweets: [], hasMore: false, nextCursor: null, page: Number(query.page || 1), mode };
    }
    baseQuery.topics = { $in: activeTopicIds };
  } else if (mode === "circles") {
    if (!principal) fail(401, "AUTH_REQUIRED", "Please sign in to view your circles feed");
    const memberships = await CircleMembership.find({ user: principal._id }).select("circle").lean();
    const circleIds = memberships.map(m => m.circle);
    if (!circleIds.length) {
      return { tweets: [], hasMore: false, nextCursor: null, page: Number(query.page || 1), mode };
    }
    const activeCircles = await Circle.find({ _id: { $in: circleIds }, status: "active" }).select("_id").lean();
    const activeCircleIds = activeCircles.map(c => c._id);
    if (!activeCircleIds.length) {
      return { tweets: [], hasMore: false, nextCursor: null, page: Number(query.page || 1), mode };
    }
    baseQuery.circle = { $in: activeCircleIds };
  }

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
  };
}
