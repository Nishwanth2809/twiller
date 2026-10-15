import FeedRule, { FEED_RULE_TYPES, FEED_RULE_DURATIONS } from "./models/feedRule.js";
import Topic from "./models/topic.js";
import { fail } from "./security.js";
import mongoose from "mongoose";

/**
 * Deterministic expiration calculation:
 * - one_hour: now + 1 hour (3600000ms)
 * - today: next midnight UTC (Date.UTC(year, month, day + 1, 0, 0, 0, 0))
 * - seven_days: now + 7 days (7 * 86400000ms)
 * - until_removed: null (indefinite until manually deleted)
 */
export function calculateExpiresAt(duration, now = new Date()) {
  const current = new Date(now);
  if (duration === "one_hour") {
    return new Date(current.getTime() + 60 * 60 * 1000);
  }
  if (duration === "today") {
    return new Date(Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate() + 1,
      0, 0, 0, 0
    ));
  }
  if (duration === "seven_days") {
    return new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  if (duration === "until_removed") {
    return null;
  }
  fail(400, "INVALID_DURATION", `Invalid duration. Choose from: ${FEED_RULE_DURATIONS.join(", ")}`);
}

/**
 * Fetch all unexpired rules for a given user principal
 */
export async function getActiveRules(userId, now = new Date()) {
  if (!userId) return [];
  if (mongoose.connection.readyState === 0 && FeedRule.find === mongoose.Model.find) {
    return [];
  }
  const current = new Date(now);
  return FeedRule.find({
    user: userId,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: current } }],
  })
    .sort({ createdAt: -1 })
    .populate("target", "name slug status")
    .lean();
}

/**
 * Create or refresh a feed rule
 */
export async function createFeedRule(principal, body, now = new Date()) {
  if (!principal?._id) fail(401, "AUTH_REQUIRED", "Please sign in to manage feed rules");

  const { ruleType, duration, targetType, targetId } = body || {};

  if (!ruleType || !FEED_RULE_TYPES.includes(ruleType)) {
    fail(400, "INVALID_RULE_TYPE", `Invalid ruleType. Choose from: ${FEED_RULE_TYPES.join(", ")}`);
  }
  if (!duration || !FEED_RULE_DURATIONS.includes(duration)) {
    fail(400, "INVALID_DURATION", `Invalid duration. Choose from: ${FEED_RULE_DURATIONS.join(", ")}`);
  }

  let finalTargetType = null;
  let finalTarget = null;

  if (ruleType === "hide_topic") {
    if (targetType !== "topic") {
      fail(400, "INVALID_INPUT", "targetType must be 'topic' for hide_topic rule");
    }
    if (!targetId || !mongoose.isValidObjectId(targetId)) {
      fail(400, "INVALID_INPUT", "Valid targetId is required for hide_topic rule");
    }
    const topic = await Topic.findById(targetId).select("status name slug").lean();
    if (!topic) {
      fail(404, "TOPIC_NOT_FOUND", "Target topic does not exist");
    }
    if (topic.status !== "active") {
      fail(400, "INACTIVE_TOPIC", "Cannot hide an inactive topic");
    }
    finalTargetType = "topic";
    finalTarget = topic._id;
  } else {
    // only_following and hide_media must not have targetType or targetId
    if (targetType !== undefined && targetType !== null) {
      fail(400, "INVALID_INPUT", `targetType is not supported for ${ruleType}`);
    }
    if (targetId !== undefined && targetId !== null) {
      fail(400, "INVALID_INPUT", `targetId is not supported for ${ruleType}`);
    }
  }

  const expiresAt = calculateExpiresAt(duration, now);

  // Check duplicate / existing rule for this user + ruleType + targetType + target
  const existing = await FeedRule.findOne({
    user: principal._id,
    ruleType,
    targetType: finalTargetType,
    target: finalTarget,
  });

  if (existing) {
    existing.duration = duration;
    existing.expiresAt = expiresAt;
    existing.updatedAt = new Date(now);
    await existing.save();
    const populated = await FeedRule.findById(existing._id).populate("target", "name slug status");
    return { rule: populated, isNew: false };
  }

  const created = await FeedRule.create({
    user: principal._id,
    ruleType,
    targetType: finalTargetType,
    target: finalTarget,
    duration,
    expiresAt,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });

  const populated = await FeedRule.findById(created._id).populate("target", "name slug status");
  return { rule: populated, isNew: true };
}

/**
 * Delete a feed rule owned by the authenticated principal
 */
export async function deleteFeedRule(principal, ruleId) {
  if (!principal?._id) fail(401, "AUTH_REQUIRED", "Please sign in to delete a feed rule");
  if (!ruleId || !mongoose.isValidObjectId(ruleId)) {
    fail(400, "INVALID_INPUT", "Invalid rule ID");
  }

  const deleted = await FeedRule.findOneAndDelete({
    _id: ruleId,
    user: principal._id,
  });

  if (!deleted) {
    fail(404, "RULE_NOT_FOUND", "Feed rule not found or you do not have permission to delete it");
  }

  return { success: true, id: String(ruleId) };
}

/**
 * List active rules for the principal
 */
export async function listActiveFeedRules(principal, now = new Date()) {
  if (!principal?._id) fail(401, "AUTH_REQUIRED", "Please sign in to view feed rules");
  const rules = await getActiveRules(principal._id, now);
  return {
    rules,
    activeCount: rules.length,
  };
}
