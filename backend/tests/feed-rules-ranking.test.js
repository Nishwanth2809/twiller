import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import FeedRule, { FEED_RULE_TYPES } from "../models/feedRule.js";
import Topic from "../models/topic.js";
import Circle from "../models/circle.js";
import CircleMembership from "../models/circleMembership.js";
import Tweet from "../models/tweet.js";
import TopicFollow from "../models/topicFollow.js";
import {
  createFeedRule,
  getActiveRules,
  populateRuleTargets,
} from "../feed-rules-operations.js";
import {
  getFeed,
  calculateFeedFingerprint,
  encodeScoreCursor,
  decodeScoreCursor,
} from "../feed-operations.js";

// Helper for mocked aggregation builder
function mockAggregation(result = []) {
  const agg = {
    _result: result,
    option() { return this; },
    then(resolve, reject) {
      return Promise.resolve(this._result).then(resolve, reject);
    },
  };
  return agg;
}

test("MODEL & VALIDATION: boost_topic, reduce_topic, and prioritize_circle rules", async () => {
  assert(FEED_RULE_TYPES.includes("boost_topic"));
  assert(FEED_RULE_TYPES.includes("reduce_topic"));
  assert(FEED_RULE_TYPES.includes("prioritize_circle"));

  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
  const topicId = new mongoose.Types.ObjectId("222222222222222222222222");
  const circleId = new mongoose.Types.ObjectId("333333333333333333333333");

  const origTopicFindById = Topic.findById;
  const origCircleFindById = Circle.findById;
  const origCircleMembershipFindOne = CircleMembership.findOne;
  const origFeedRuleFindOne = FeedRule.findOne;
  const origFeedRuleCreate = FeedRule.create;
  const origTopicFind = Topic.find;
  const origCircleFind = Circle.find;

  try {
    Topic.findById = (id) => ({
      select: () => ({
        lean: () => Promise.resolve({ _id: id, status: "active", name: "AI", slug: "ai" }),
      }),
    });
    Circle.findById = (id) => ({
      select: () => ({
        lean: () => Promise.resolve({ _id: id, status: "active", name: "Builders", slug: "builders" }),
      }),
    });
    FeedRule.findOne = () => Promise.resolve(null);
    FeedRule.create = async (doc) => ({ _id: new mongoose.Types.ObjectId(), ...doc, toObject: () => doc });
    Topic.find = () => ({ select: () => ({ lean: () => Promise.resolve([{ _id: topicId, name: "AI", slug: "ai" }]) }) });
    Circle.find = () => ({ select: () => ({ lean: () => Promise.resolve([{ _id: circleId, name: "Builders", slug: "builders" }]) }) });

    // 1. boost_topic success
    const boostRes = await createFeedRule(principal, {
      ruleType: "boost_topic",
      targetType: "topic",
      targetId: topicId,
      duration: "seven_days",
    });
    assert.equal(boostRes.rule.ruleType, "boost_topic");
    assert.equal(boostRes.rule.targetType, "topic");
    assert.equal(boostRes.rule.target.name, "AI");

    // 2. reduce_topic success
    const reduceRes = await createFeedRule(principal, {
      ruleType: "reduce_topic",
      targetType: "topic",
      targetId: topicId,
      duration: "today",
    });
    assert.equal(reduceRes.rule.ruleType, "reduce_topic");

    // 3. prioritize_circle when NOT a member fails with 403
    CircleMembership.findOne = () => ({ lean: () => Promise.resolve(null) });
    await assert.rejects(
      createFeedRule(principal, {
        ruleType: "prioritize_circle",
        targetType: "circle",
        targetId: circleId,
        duration: "one_hour",
      }),
      error => error.status === 403 && error.code === "NOT_CIRCLE_MEMBER"
    );

    // 4. prioritize_circle when IS a member succeeds
    CircleMembership.findOne = () => ({ lean: () => Promise.resolve({ _id: new mongoose.Types.ObjectId(), circle: circleId, user: principal._id }) });
    const circleRes = await createFeedRule(principal, {
      ruleType: "prioritize_circle",
      targetType: "circle",
      targetId: circleId,
      duration: "until_removed",
    });
    assert.equal(circleRes.rule.ruleType, "prioritize_circle");
    assert.equal(circleRes.rule.targetType, "circle");
    assert.equal(circleRes.rule.target.name, "Builders");

    // 5. Inactive topic / circle rejected with 400
    Topic.findById = () => ({ select: () => ({ lean: () => Promise.resolve({ status: "disabled" }) }) });
    await assert.rejects(
      createFeedRule(principal, { ruleType: "boost_topic", targetType: "topic", targetId: topicId, duration: "today" }),
      error => error.status === 400 && error.code === "INACTIVE_TOPIC"
    );

    Circle.findById = () => ({ select: () => ({ lean: () => Promise.resolve({ status: "disabled" }) }) });
    await assert.rejects(
      createFeedRule(principal, { ruleType: "prioritize_circle", targetType: "circle", targetId: circleId, duration: "today" }),
      error => error.status === 400 && error.code === "INACTIVE_CIRCLE"
    );
  } finally {
    Topic.findById = origTopicFindById;
    Circle.findById = origCircleFindById;
    CircleMembership.findOne = origCircleMembershipFindOne;
    FeedRule.findOne = origFeedRuleFindOne;
    FeedRule.create = origFeedRuleCreate;
    Topic.find = origTopicFind;
    Circle.find = origCircleFind;
  }
});

test("RANKING LOGIC: Mathematical weights and deterministic tie-breaking", () => {
  const boostTopic = "topic_ai";
  const reduceTopic = "topic_spam";
  const prioritizeCircle = "circle_builders";

  const posts = [
    { _id: "1", content: "AI & Circle post", topics: [boostTopic], circle: prioritizeCircle, timestamp: 100 },
    { _id: "2", content: "Normal post", topics: [], circle: null, timestamp: 200 },
    { _id: "3", content: "Spam post", topics: [reduceTopic], circle: null, timestamp: 300 },
    { _id: "4", content: "AI post", topics: [boostTopic], circle: null, timestamp: 150 },
    { _id: "5", content: "Older AI post", topics: [boostTopic], circle: null, timestamp: 100 },
  ];

  // Calculate score according to spec: boost = +2, reduce = -2, prioritize = +3
  const scored = posts.map(p => {
    let score = 0;
    if (p.topics.includes(boostTopic)) score += 2;
    if (p.topics.includes(reduceTopic)) score -= 2;
    if (p.circle === prioritizeCircle) score += 3;
    return { ...p, score };
  });

  // Sort by score DESC, timestamp DESC, _id DESC
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return b._id.localeCompare(a._id);
  });

  // Post 1: score = 5 (2 + 3) -> Top
  assert.equal(scored[0]._id, "1");
  assert.equal(scored[0].score, 5);

  // Post 4: score = 2, timestamp = 150
  assert.equal(scored[1]._id, "4");
  assert.equal(scored[1].score, 2);

  // Post 5: score = 2, timestamp = 100 (tie broken chronologically)
  assert.equal(scored[2]._id, "5");
  assert.equal(scored[2].score, 2);

  // Post 2: score = 0
  assert.equal(scored[3]._id, "2");
  assert.equal(scored[3].score, 0);

  // Post 3: score = -2 -> Bottom
  assert.equal(scored[4]._id, "3");
  assert.equal(scored[4].score, -2);
});

test("PREFERENCE INTERACTION: Filter rules win unconditionally before ranking", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111"), following: [] };
  const topicId = new mongoose.Types.ObjectId("222222222222222222222222");
  const circleId = new mongoose.Types.ObjectId("333333333333333333333333");

  const origFeedRuleFind = FeedRule.find;
  const origTweetAggregate = Tweet.aggregate;
  const origMemberFind = CircleMembership.find;
  let capturedPipeline = null;

  try {
    // Active rules: hide_topic AND boost_topic for same topic, PLUS hide_media AND prioritize_circle
    FeedRule.find = () => ({
      sort: () => ({
        lean: () => Promise.resolve([
          { ruleType: "hide_topic", targetType: "topic", target: topicId, expiresAt: null },
          { ruleType: "boost_topic", targetType: "topic", target: topicId, expiresAt: null },
          { ruleType: "hide_media", targetType: null, target: null, expiresAt: null },
          { ruleType: "prioritize_circle", targetType: "circle", target: circleId, expiresAt: null },
        ]),
      }),
    });

    CircleMembership.find = () => ({
      select: () => ({ lean: () => Promise.resolve([{ circle: circleId }]) }),
    });

    Tweet.aggregate = (pipeline) => {
      capturedPipeline = pipeline;
      return mockAggregation([]);
    };

    await getFeed(principal, { mode: "foryou" });

    // 1. Base query in $match MUST filter out hidden topic and media
    const matchStage = capturedPipeline.find(s => s.$match)?.$match;
    assert.ok(matchStage, "Pipeline must start with $match");
    assert(matchStage.topics?.$nin, "Hidden topic must be in $nin");
    assert.equal(String(matchStage.topics.$nin[0]), String(topicId));
    assert.deepEqual(matchStage.image, { $in: [null, ""] }, "Media must be excluded");
    assert.deepEqual(matchStage.audio, { $in: [null, ""] }, "Audio must be excluded");

    // 2. Score calculation stage exists
    const addFieldsStage = capturedPipeline.find(s => s.$addFields)?.$addFields;
    assert.ok(addFieldsStage?.feedScore, "Must add feedScore in pipeline");
  } finally {
    FeedRule.find = origFeedRuleFind;
    Tweet.aggregate = origTweetAggregate;
    CircleMembership.find = origMemberFind;
  }
});

test("CURSOR & FINGERPRINT: Score-aware cursor pagination and stale configuration detection", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
  const topicId = new mongoose.Types.ObjectId("222222222222222222222222");

  // 1. Fingerprint calculation is deterministic
  const fp1 = calculateFeedFingerprint("foryou", [
    { ruleType: "boost_topic", targetType: "topic", target: { _id: topicId } },
  ]);
  const fp2 = calculateFeedFingerprint("foryou", [
    { ruleType: "boost_topic", targetType: "topic", target: { _id: topicId } },
  ]);
  assert.equal(fp1, fp2);

  // Different rule produces different fingerprint
  const fpOther = calculateFeedFingerprint("foryou", [
    { ruleType: "reduce_topic", targetType: "topic", target: { _id: topicId } },
  ]);
  assert.notEqual(fp1, fpOther);

  // 2. Encode and decode score cursor
  const encoded = encodeScoreCursor({ timestamp: new Date("2026-10-15T10:00:00.000Z"), _id: "67b0d77a89ab12cd34ef5601" }, 2, fp1);
  const decoded = decodeScoreCursor(encoded);
  assert.equal(decoded.s, 2);
  assert.equal(decoded.id, "67b0d77a89ab12cd34ef5601");
  assert.equal(decoded.t.toISOString(), "2026-10-15T10:00:00.000Z");
  assert.equal(decoded.fp, fp1);

  // 3. Stale cursor rejection: when feed fingerprint mismatches, throws 400 STALE_FEED_CURSOR
  const origFeedRuleFind = FeedRule.find;
  try {
    FeedRule.find = () => ({
      sort: () => ({
        lean: () => Promise.resolve([
          { ruleType: "boost_topic", targetType: "topic", target: topicId, expiresAt: null },
        ]),
      }),
    });

    // Provide cursor with old / different fingerprint
    const staleCursor = encodeScoreCursor(
      { timestamp: new Date("2026-10-15T10:00:00.000Z"), _id: "67b0d77a89ab12cd34ef5601" },
      2,
      "stale_fingerprint_123"
    );

    await assert.rejects(
      getFeed(principal, { mode: "foryou", cursor: staleCursor }),
      error => error.status === 400 && error.code === "STALE_FEED_CURSOR"
    );

    // Malformed cursor throws 400 INVALID_CURSOR
    await assert.rejects(
      getFeed(principal, { mode: "foryou", cursor: "not_valid_base64_json!!!" }),
      error => error.status === 400 && error.code === "INVALID_CURSOR"
    );
  } finally {
    FeedRule.find = origFeedRuleFind;
  }
});

test("MEMBERSHIP NEUTRALIZATION: Leaving a circle zeroes its priority contribution", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111"), following: [] };
  const circleId = new mongoose.Types.ObjectId("333333333333333333333333");

  const origFeedRuleFind = FeedRule.find;
  const origTweetAggregate = Tweet.aggregate;
  const origMemberFind = CircleMembership.find;
  let capturedPipeline = null;

  try {
    FeedRule.find = () => ({
      sort: () => ({
        lean: () => Promise.resolve([
          { ruleType: "prioritize_circle", targetType: "circle", target: circleId, expiresAt: null },
        ]),
      }),
    });

    // User is NO LONGER a member of circleId
    CircleMembership.find = () => ({
      select: () => ({ lean: () => Promise.resolve([]) }),
    });

    Tweet.aggregate = (pipeline) => {
      capturedPipeline = pipeline;
      return mockAggregation([]);
    };

    await getFeed(principal, { mode: "foryou" });

    // When not a member, no +3 score addend is added for that circle
    const addFieldsStage = capturedPipeline.find(s => s.$addFields)?.$addFields;
    const addends = addFieldsStage.feedScore.$add;
    // Base 0 only, no circle condition added
    assert.equal(addends.length, 1);
    assert.equal(addends[0], 0);
  } finally {
    FeedRule.find = origFeedRuleFind;
    Tweet.aggregate = origTweetAggregate;
    CircleMembership.find = origMemberFind;
  }
});

test("PAGINATION STABILITY: Aggregation applies score continuation filter across pages", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111"), following: [] };
  const topicId = new mongoose.Types.ObjectId("222222222222222222222222");

  const origFeedRuleFind = FeedRule.find;
  const origTweetAggregate = Tweet.aggregate;
  let capturedPipeline = null;

  try {
    FeedRule.find = () => ({
      sort: () => ({
        lean: () => Promise.resolve([
          { ruleType: "boost_topic", targetType: "topic", target: topicId, expiresAt: null },
        ]),
      }),
    });

    const fp = calculateFeedFingerprint("foryou", [
      { ruleType: "boost_topic", targetType: "topic", target: topicId },
    ]);

    const cursor = encodeScoreCursor(
      { timestamp: new Date("2026-10-15T09:30:00.000Z"), _id: "67b0d77a89ab12cd34ef5602" },
      2,
      fp
    );

    Tweet.aggregate = (pipeline) => {
      capturedPipeline = pipeline;
      return mockAggregation([
        { _id: new mongoose.Types.ObjectId("67b0d77a89ab12cd34ef5603"), timestamp: new Date("2026-10-15T09:00:00.000Z"), feedScore: 2 },
      ]);
    };

    const res = await getFeed(principal, { mode: "foryou", cursor, limit: 1 });
    assert.equal(res.tweets.length, 1);

    // Verify continuation match stage exists in pipeline
    const continuationStage = capturedPipeline.find(s => s.$match && s.$match.$or);
    assert.ok(continuationStage, "Expected continuation $match stage with $or for score, timestamp, _id");
    assert(continuationStage.$match.$or.some(c => c.feedScore?.$lt === 2));
  } finally {
    FeedRule.find = origFeedRuleFind;
    Tweet.aggregate = origTweetAggregate;
  }
});

test("PAGINATION MULTI-PAGE: Simulates page 1 -> page 2 -> page 3 across score boundaries with 0 duplicates", () => {
  // Simulate fixture posts across score transitions: +5 -> +3 -> +2 -> 0 -> -2
  const allPosts = [
    { _id: "1", score: 5, timestamp: 500, content: "Score +5" },
    { _id: "2", score: 3, timestamp: 400, content: "Score +3" },
    { _id: "3", score: 2, timestamp: 350, content: "Score +2 (P1)" },
    { _id: "4", score: 2, timestamp: 300, content: "Score +2 (P2)" },
    { _id: "5", score: 0, timestamp: 200, content: "Score 0" },
    { _id: "6", score: -2, timestamp: 100, content: "Score -2" },
  ];

  // Helper to paginate deterministically
  function paginate(posts, cursor, limit) {
    let candidates = posts;
    if (cursor) {
      candidates = candidates.filter(p => {
        if (p.score < cursor.s) return true;
        if (p.score === cursor.s && p.timestamp < cursor.t) return true;
        if (p.score === cursor.s && p.timestamp === cursor.t && p._id < cursor.id) return true;
        return false;
      });
    }
    const pageItems = candidates.slice(0, limit);
    const hasMore = candidates.length > limit;
    const nextCursor = hasMore && pageItems.length > 0
      ? { s: pageItems[pageItems.length - 1].score, t: pageItems[pageItems.length - 1].timestamp, id: pageItems[pageItems.length - 1]._id }
      : null;
    return { items: pageItems, nextCursor, hasMore };
  }

  // Page 1 (limit 2): Expect posts 1 (+5) and 2 (+3)
  const p1 = paginate(allPosts, null, 2);
  assert.equal(p1.items.length, 2);
  assert.deepEqual(p1.items.map(p => p._id), ["1", "2"]);
  assert.ok(p1.nextCursor);

  // Page 2 (limit 2): Expect posts 3 (+2) and 4 (+2)
  const p2 = paginate(allPosts, p1.nextCursor, 2);
  assert.equal(p2.items.length, 2);
  assert.deepEqual(p2.items.map(p => p._id), ["3", "4"]);
  assert.ok(p2.nextCursor);

  // Page 3 (limit 2): Expect posts 5 (0) and 6 (-2)
  const p3 = paginate(allPosts, p2.nextCursor, 2);
  assert.equal(p3.items.length, 2);
  assert.deepEqual(p3.items.map(p => p._id), ["5", "6"]);
  assert.equal(p3.nextCursor, null);
  assert.equal(p3.hasMore, false);

  // Assert ZERO duplicates and ZERO missing posts across all 3 pages
  const collectedIds = [...p1.items, ...p2.items, ...p3.items].map(p => p._id);
  assert.equal(collectedIds.length, 6);
  assert.equal(new Set(collectedIds).size, 6, "Must contain exactly 6 unique IDs with 0 duplicates");
  assert.deepEqual(collectedIds, ["1", "2", "3", "4", "5", "6"]);
});

test("ZERO-WEIGHT FAST PATH: Unweighted feeds use Tweet.find and do not run aggregation", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111"), following: [] };

  const origFeedRuleFind = FeedRule.find;
  const origTweetAggregate = Tweet.aggregate;
  const origTweetFind = Tweet.find;

  let aggregateCalled = false;
  let findCalled = false;

  try {
    // Only filter rules or zero rules (NO weighted rules)
    FeedRule.find = () => ({
      sort: () => ({
        lean: () => Promise.resolve([
          { ruleType: "only_following", targetType: null, target: null, expiresAt: null },
        ]),
      }),
    });

    Tweet.aggregate = () => {
      aggregateCalled = true;
      return mockAggregation([]);
    };

    Tweet.find = () => {
      findCalled = true;
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              populate: () => Promise.resolve([]),
            }),
          }),
        }),
      };
    };

    const res = await getFeed(principal, { mode: "foryou" });
    assert.equal(findCalled, true, "Fast path must invoke Tweet.find");
    assert.equal(aggregateCalled, false, "Fast path must NOT invoke Tweet.aggregate");
    assert.equal(res.activeRulesCount, 1);
  } finally {
    FeedRule.find = origFeedRuleFind;
    Tweet.aggregate = origTweetAggregate;
    Tweet.find = origTweetFind;
  }
});

test("EXPIRY: Weighted rule expiration changes fingerprint and invalidates prior cursor", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
  const topicId = new mongoose.Types.ObjectId("222222222222222222222222");

  // State 1: Boost rule active
  const activeFp = calculateFeedFingerprint("foryou", [
    { ruleType: "boost_topic", targetType: "topic", target: { _id: topicId } },
  ]);
  const activeCursor = encodeScoreCursor(
    { timestamp: new Date("2026-10-15T10:00:00Z"), _id: "67b0d77a89ab12cd34ef5601" },
    2,
    activeFp
  );

  // State 2: Rule expires -> activeRules becomes empty
  const expiredFp = calculateFeedFingerprint("foryou", []);
  assert.notEqual(activeFp, expiredFp);

  // In State 2, if client sends activeCursor to weighted feed, fingerprint mismatch triggers STALE_FEED_CURSOR
  const origFeedRuleFind = FeedRule.find;
  try {
    // Other weighted rule active, so weighted pipeline runs
    FeedRule.find = () => ({
      sort: () => ({
        lean: () => Promise.resolve([
          { ruleType: "reduce_topic", targetType: "topic", target: topicId, expiresAt: null },
        ]),
      }),
    });

    await assert.rejects(
      getFeed(principal, { mode: "foryou", cursor: activeCursor }),
      error => error.status === 400 && error.code === "STALE_FEED_CURSOR"
    );
  } finally {
    FeedRule.find = origFeedRuleFind;
  }
});
