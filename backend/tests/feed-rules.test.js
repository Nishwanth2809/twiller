import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import FeedRule, { FEED_RULE_TYPES, FEED_RULE_DURATIONS } from "../models/feedRule.js";
import Topic from "../models/topic.js";
import Tweet from "../models/tweet.js";
import TopicFollow from "../models/topicFollow.js";
import Circle from "../models/circle.js";
import CircleMembership from "../models/circleMembership.js";
import {
  calculateExpiresAt,
  getActiveRules,
  createFeedRule,
  deleteFeedRule,
  listActiveFeedRules,
} from "../feed-rules-operations.js";
import { getFeed } from "../feed-operations.js";

// Helper for mocked query builder
function mockQuery(result = []) {
  const query = {
    _result: result,
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    select() { return this; },
    populate() { return this; },
    lean() { return Promise.resolve(this._result); },
    then(resolve, reject) {
      return Promise.resolve(this._result).then(resolve, reject);
    },
  };
  return query;
}

test("FeedRule Model: schema enums, indexes, and constants", () => {
  assert.deepEqual(FEED_RULE_TYPES, [
    "only_following",
    "hide_topic",
    "hide_media",
    "boost_topic",
    "reduce_topic",
    "prioritize_circle",
  ]);
  assert.deepEqual(FEED_RULE_DURATIONS, ["one_hour", "today", "seven_days", "until_removed"]);

  const indexes = FeedRule.schema.indexes();
  const indexFields = indexes.map(([fields]) => Object.keys(fields).join("_"));
  assert(indexFields.includes("user_createdAt"));
  assert(indexFields.includes("user_expiresAt"));
  assert(indexFields.includes("user_ruleType_targetType_target"));

  const uniqueIndex = indexes.find(([fields, opts]) => fields.user && fields.ruleType && opts?.unique);
  assert(uniqueIndex, "Expected unique compound index on user + ruleType + targetType + target");
});

test("Duration Model: deterministic expiration calculation", () => {
  const baseTime = new Date("2026-10-15T12:00:00.000Z");

  // one_hour
  const oneHour = calculateExpiresAt("one_hour", baseTime);
  assert.equal(oneHour.toISOString(), "2026-10-15T13:00:00.000Z");

  // today: next midnight UTC
  const today = calculateExpiresAt("today", baseTime);
  assert.equal(today.toISOString(), "2026-10-16T00:00:00.000Z");

  // seven_days
  const sevenDays = calculateExpiresAt("seven_days", baseTime);
  assert.equal(sevenDays.toISOString(), "2026-10-22T12:00:00.000Z");

  // until_removed
  const untilRemoved = calculateExpiresAt("until_removed", baseTime);
  assert.equal(untilRemoved, null);

  // invalid
  assert.throws(() => calculateExpiresAt("invalid_duration", baseTime), error => error.status === 400 && error.code === "INVALID_DURATION");
});

test("API: Feed rule validation and creation rules", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
  const topicId = new mongoose.Types.ObjectId("222222222222222222222222");

  // Reject unauthenticated
  await assert.rejects(createFeedRule(null, {}), error => error.status === 401 && error.code === "AUTH_REQUIRED");

  // Reject invalid ruleType
  await assert.rejects(createFeedRule(principal, { ruleType: "bad_type", duration: "today" }), error => error.status === 400 && error.code === "INVALID_RULE_TYPE");

  // Reject invalid duration
  await assert.rejects(createFeedRule(principal, { ruleType: "only_following", duration: "bad_duration" }), error => error.status === 400 && error.code === "INVALID_DURATION");

  // only_following with extra targetType/targetId rejected
  await assert.rejects(
    createFeedRule(principal, { ruleType: "only_following", duration: "today", targetType: "topic" }),
    error => error.status === 400 && error.code === "INVALID_INPUT"
  );
  await assert.rejects(
    createFeedRule(principal, { ruleType: "only_following", duration: "today", targetId: topicId }),
    error => error.status === 400 && error.code === "INVALID_INPUT"
  );

  // hide_media with extra targetType/targetId rejected
  await assert.rejects(
    createFeedRule(principal, { ruleType: "hide_media", duration: "today", targetType: "topic" }),
    error => error.status === 400 && error.code === "INVALID_INPUT"
  );

  // hide_topic missing targetType / targetId rejected
  await assert.rejects(
    createFeedRule(principal, { ruleType: "hide_topic", duration: "today" }),
    error => error.status === 400 && error.code === "INVALID_INPUT"
  );
  await assert.rejects(
    createFeedRule(principal, { ruleType: "hide_topic", duration: "today", targetType: "not_topic", targetId: topicId }),
    error => error.status === 400 && error.code === "INVALID_INPUT"
  );

  // hide_topic targeting non-existent topic rejected with 404
  const origTopicFindById = Topic.findById;
  try {
    Topic.findById = () => ({ select: () => ({ lean: () => Promise.resolve(null) }) });
    await assert.rejects(
      createFeedRule(principal, { ruleType: "hide_topic", duration: "today", targetType: "topic", targetId: topicId }),
      error => error.status === 404 && error.code === "TOPIC_NOT_FOUND"
    );

    // hide_topic targeting inactive topic rejected with 400
    Topic.findById = () => ({ select: () => ({ lean: () => Promise.resolve({ _id: topicId, status: "disabled" }) }) });
    await assert.rejects(
      createFeedRule(principal, { ruleType: "hide_topic", duration: "today", targetType: "topic", targetId: topicId }),
      error => error.status === 400 && error.code === "INACTIVE_TOPIC"
    );
  } finally {
    Topic.findById = origTopicFindById;
  }
});

test("API: Create only_following, hide_media, hide_topic with duplicate behavior", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
  const topicId = new mongoose.Types.ObjectId("222222222222222222222222");

  const origFindOne = FeedRule.findOne;
  const origCreate = FeedRule.create;
  const origFindById = FeedRule.findById;
  const origTopicFindById = Topic.findById;

  try {
    Topic.findById = () => ({ select: () => ({ lean: () => Promise.resolve({ _id: topicId, status: "active", name: "AI", slug: "ai" }) }) });

    // 1. Create new only_following rule
    FeedRule.findOne = () => Promise.resolve(null);
    FeedRule.create = async (doc) => ({ _id: new mongoose.Types.ObjectId("333333333333333333333333"), ...doc });
    FeedRule.findById = (id) => ({
      populate: () => Promise.resolve({ _id: id, ruleType: "only_following", duration: "one_hour", targetType: null, target: null })
    });

    const resOnlyFollowing = await createFeedRule(principal, { ruleType: "only_following", duration: "one_hour" });
    assert.equal(resOnlyFollowing.isNew, true);
    assert.equal(resOnlyFollowing.rule.ruleType, "only_following");

    // 2. Duplicate rule behavior: updating duration of existing rule
    let saved = false;
    const existingRule = {
      _id: new mongoose.Types.ObjectId("333333333333333333333333"),
      user: principal._id,
      ruleType: "only_following",
      duration: "one_hour",
      save() { saved = true; return Promise.resolve(this); }
    };
    FeedRule.findOne = () => Promise.resolve(existingRule);
    FeedRule.findById = (id) => ({
      populate: () => Promise.resolve({ _id: id, ruleType: "only_following", duration: "today" })
    });

    const resDuplicate = await createFeedRule(principal, { ruleType: "only_following", duration: "today" });
    assert.equal(resDuplicate.isNew, false);
    assert.equal(saved, true);
    assert.equal(existingRule.duration, "today");
  } finally {
    FeedRule.findOne = origFindOne;
    FeedRule.create = origCreate;
    FeedRule.findById = origFindById;
    Topic.findById = origTopicFindById;
  }
});

test("API: delete own rule vs reject deleting another user's rule", async () => {
  const principalA = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
  const ruleId = new mongoose.Types.ObjectId("444444444444444444444444");

  const origFindOneAndDelete = FeedRule.findOneAndDelete;
  try {
    // Owner deletes own rule -> success
    FeedRule.findOneAndDelete = ({ _id, user }) => {
      if (String(_id) === String(ruleId) && String(user) === String(principalA._id)) {
        return Promise.resolve({ _id, user });
      }
      return Promise.resolve(null);
    };

    const deleteRes = await deleteFeedRule(principalA, ruleId);
    assert.equal(deleteRes.success, true);
    assert.equal(deleteRes.id, String(ruleId));

    // Another user tries to delete rule -> 404
    const principalB = { _id: new mongoose.Types.ObjectId("555555555555555555555555") };
    await assert.rejects(deleteFeedRule(principalB, ruleId), error => error.status === 404 && error.code === "RULE_NOT_FOUND");
  } finally {
    FeedRule.findOneAndDelete = origFindOneAndDelete;
  }
});

test("API: listActiveFeedRules excludes expired rules and returns activeCount", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
  const now = new Date("2026-10-15T12:00:00.000Z");

  const origFind = FeedRule.find;
  try {
    const activeRules = [
      { _id: new mongoose.Types.ObjectId(), ruleType: "only_following", duration: "today", expiresAt: new Date("2026-10-16T00:00:00.000Z") },
      { _id: new mongoose.Types.ObjectId(), ruleType: "hide_media", duration: "until_removed", expiresAt: null },
    ];
    FeedRule.find = (query) => {
      assert.equal(String(query.user), String(principal._id));
      assert(query.$or, "Expected $or query for expiresAt null or > now");
      return mockQuery(activeRules);
    };

    const res = await listActiveFeedRules(principal, now);
    assert.equal(res.activeCount, 2);
    assert.equal(res.rules.length, 2);
  } finally {
    FeedRule.find = origFind;
  }
});

test("FEED: only_following rule scopes For You, Topics, and Circles feeds", async () => {
  const principal = {
    _id: new mongoose.Types.ObjectId("111111111111111111111111"),
    following: [new mongoose.Types.ObjectId("222222222222222222222222")]
  };

  const origRuleFind = FeedRule.find;
  const origTweetFind = Tweet.find;
  const origTopicFollowFind = TopicFollow.find;
  const origTopicFind = Topic.find;
  let capturedQuery = null;

  try {
    // Active only_following rule
    FeedRule.find = () => mockQuery([{ ruleType: "only_following", targetType: null, target: null, expiresAt: null }]);

    Tweet.find = (q) => {
      capturedQuery = q;
      return mockQuery([]);
    };

    // 1. For You with only_following
    await getFeed(principal, { mode: "foryou" });
    assert(capturedQuery.author?.$in, "Expected author filter in For You when only_following is active");
    assert.equal(capturedQuery.author.$in.length, 2);

    // 2. Topics with only_following
    const topicId = new mongoose.Types.ObjectId("333333333333333333333333");
    TopicFollow.find = () => ({ select: () => ({ lean: () => Promise.resolve([{ topic: topicId }]) }) });
    Topic.find = () => ({ select: () => ({ lean: () => Promise.resolve([{ _id: topicId, status: "active" }]) }) });

    await getFeed(principal, { mode: "topics" });
    assert(capturedQuery.topics?.$in, "Expected topics in filter");
    assert(capturedQuery.author?.$in, "Expected author in filter combined with topics mode");

    // 3. Anonymous For You is NOT affected by rules
    capturedQuery = null;
    await getFeed(null, { mode: "foryou" });
    assert.equal(capturedQuery.author, undefined, "Anonymous For You must not filter by author");
  } finally {
    FeedRule.find = origRuleFind;
    Tweet.find = origTweetFind;
    TopicFollow.find = origTopicFollowFind;
    Topic.find = origTopicFind;
  }
});

test("FEED: hide_topic and hide_media rules safely exclude targeted content", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
  const hiddenTopicId1 = new mongoose.Types.ObjectId("444444444444444444444444");
  const hiddenTopicId2 = new mongoose.Types.ObjectId("555555555555555555555555");

  const origRuleFind = FeedRule.find;
  const origTweetFind = Tweet.find;
  let capturedQuery = null;

  try {
    FeedRule.find = () => mockQuery([
      { ruleType: "hide_topic", targetType: "topic", target: { _id: hiddenTopicId1 }, expiresAt: null },
      { ruleType: "hide_topic", targetType: "topic", target: { _id: hiddenTopicId2 }, expiresAt: null },
      { ruleType: "hide_media", targetType: null, target: null, expiresAt: null },
    ]);

    Tweet.find = (q) => {
      capturedQuery = q;
      return mockQuery([]);
    };

    await getFeed(principal, { mode: "foryou" });

    // Multiple hidden topics excluded via $nin
    assert(capturedQuery.topics?.$nin, "Expected topics $nin filter");
    assert.equal(capturedQuery.topics.$nin.length, 2);

    // Media excluded: both image and audio must be null or empty
    assert.deepEqual(capturedQuery.image, { $in: [null, ""] });
    assert.deepEqual(capturedQuery.audio, { $in: [null, ""] });
  } finally {
    FeedRule.find = origRuleFind;
    Tweet.find = origTweetFind;
  }
});

test("FEED: rule intersection combines only_following, hide_topic, and hide_media cleanly", async () => {
  const principal = {
    _id: new mongoose.Types.ObjectId("111111111111111111111111"),
    following: [new mongoose.Types.ObjectId("222222222222222222222222")]
  };
  const activeTopicId = new mongoose.Types.ObjectId("333333333333333333333333");
  const hiddenTopicId = new mongoose.Types.ObjectId("444444444444444444444444");

  const origRuleFind = FeedRule.find;
  const origTweetFind = Tweet.find;
  const origTopicFollowFind = TopicFollow.find;
  const origTopicFind = Topic.find;
  let capturedQuery = null;

  try {
    FeedRule.find = () => mockQuery([
      { ruleType: "only_following", targetType: null, target: null, expiresAt: null },
      { ruleType: "hide_topic", targetType: "topic", target: { _id: hiddenTopicId }, expiresAt: null },
      { ruleType: "hide_media", targetType: null, target: null, expiresAt: null },
    ]);

    TopicFollow.find = () => ({ select: () => ({ lean: () => Promise.resolve([{ topic: activeTopicId }]) }) });
    Topic.find = () => ({ select: () => ({ lean: () => Promise.resolve([{ _id: activeTopicId, status: "active" }]) }) });

    Tweet.find = (q) => {
      capturedQuery = q;
      return mockQuery([]);
    };

    // Feed Mode: Topics + only_following + hide_topic + hide_media
    await getFeed(principal, { mode: "topics" });

    // 1. Topics must be followed active topic AND not contain hidden topic
    assert(capturedQuery.topics?.$in, "Topics must be in activeTopicIds");
    assert.equal(String(capturedQuery.topics.$in[0]), String(activeTopicId));
    assert(capturedQuery.topics?.$nin, "Hidden topic must be in $nin");
    assert.equal(String(capturedQuery.topics.$nin[0]), String(hiddenTopicId));

    // 2. Author must be followed users or self
    assert(capturedQuery.author?.$in, "Author must be in followed users or self");
    assert.equal(capturedQuery.author.$in.length, 2);

    // 3. Media excluded
    assert.deepEqual(capturedQuery.image, { $in: [null, ""] });
    assert.deepEqual(capturedQuery.audio, { $in: [null, ""] });

    // 4. Cursor timestamp filter preserved
    assert.equal(capturedQuery.parentId, null);
    assert.equal(capturedQuery.deletedAt, null);
  } finally {
    FeedRule.find = origRuleFind;
    Tweet.find = origTweetFind;
    TopicFollow.find = origTopicFollowFind;
    Topic.find = origTopicFind;
  }
});

test("EXPIRY: expired rules are excluded and until_removed remains active", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
  const now = new Date("2026-10-15T12:00:00.000Z");

  const origFind = FeedRule.find;
  let capturedQuery = null;

  try {
    FeedRule.find = (q) => {
      capturedQuery = q;
      // Simulate MongoDB returning only matching unexpired docs based on $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
      return mockQuery([
        { _id: new mongoose.Types.ObjectId(), ruleType: "only_following", expiresAt: null }, // until_removed
        { _id: new mongoose.Types.ObjectId(), ruleType: "hide_media", expiresAt: new Date("2026-10-15T13:00:00.000Z") } // active for 1 hr
      ]);
    };

    const result = await listActiveFeedRules(principal, now);
    assert.equal(result.activeCount, 2);
    assert(capturedQuery.$or.some(c => c.expiresAt === null));
    assert(capturedQuery.$or.some(c => c.expiresAt?.$gt instanceof Date));
  } finally {
    FeedRule.find = origFind;
  }
});

test("FEED: Circles mode + only_following narrows to joined circles AND followed authors/self", async () => {
  const principal = {
    _id: new mongoose.Types.ObjectId("111111111111111111111111"),
    following: [new mongoose.Types.ObjectId("222222222222222222222222")]
  };
  const joinedCircleId = new mongoose.Types.ObjectId("666666666666666666666666");

  const origRuleFind = FeedRule.find;
  const origTweetFind = Tweet.find;
  const origMemberFind = CircleMembership.find;
  const origCircleFind = Circle.find;
  let capturedQuery = null;

  try {
    FeedRule.find = () => mockQuery([
      { ruleType: "only_following", targetType: null, target: null, expiresAt: null }
    ]);
    CircleMembership.find = () => ({ select: () => ({ lean: () => Promise.resolve([{ circle: joinedCircleId }]) }) });
    Circle.find = () => ({ select: () => ({ lean: () => Promise.resolve([{ _id: joinedCircleId, status: "active" }]) }) });
    Tweet.find = (q) => {
      capturedQuery = q;
      return mockQuery([]);
    };

    await getFeed(principal, { mode: "circles" });

    // Must restrict to joined circle
    assert.equal(String(capturedQuery.circle.$in[0]), String(joinedCircleId));
    // AND must restrict author to followed authors + self
    assert(capturedQuery.author?.$in, "Author must be filtered in circles mode when only_following is active");
    assert.equal(capturedQuery.author.$in.length, 2);
    // Base post constraints remain
    assert.equal(capturedQuery.parentId, null);
    assert.equal(capturedQuery.deletedAt, null);
  } finally {
    FeedRule.find = origRuleFind;
    Tweet.find = origTweetFind;
    CircleMembership.find = origMemberFind;
    Circle.find = origCircleFind;
  }
});

test("SAFETY: Circle visibility cannot be broadened by Feed Rules", async () => {
  const principal = {
    _id: new mongoose.Types.ObjectId("111111111111111111111111"),
    following: []
  };

  const origRuleFind = FeedRule.find;
  const origTweetFind = Tweet.find;
  const origMemberFind = CircleMembership.find;

  try {
    FeedRule.find = () => mockQuery([
      { ruleType: "only_following", targetType: null, target: null, expiresAt: null },
      { ruleType: "hide_media", targetType: null, target: null, expiresAt: null }
    ]);
    // Principal belongs to 0 circles
    CircleMembership.find = () => ({ select: () => ({ lean: () => Promise.resolve([]) }) });
    let tweetFindCalled = false;
    Tweet.find = () => {
      tweetFindCalled = true;
      return mockQuery([]);
    };

    const feed = await getFeed(principal, { mode: "circles" });
    // If user has 0 circles, Tweet.find should never even query for public or unjoined circles
    assert.equal(feed.tweets.length, 0);
    assert.equal(feed.nextCursor, null);
    assert.equal(tweetFindCalled, false, "Must not query tweets when user has no circle memberships");
  } finally {
    FeedRule.find = origRuleFind;
    Tweet.find = origTweetFind;
    CircleMembership.find = origMemberFind;
  }
});

test("ISOLATION: User A rules never affect User B's feed query and vice-versa", async () => {
  const userA = { _id: new mongoose.Types.ObjectId("111111111111111111111111"), following: [] };
  const userB = { _id: new mongoose.Types.ObjectId("222222222222222222222222"), following: [] };

  const origRuleFind = FeedRule.find;
  const origTweetFind = Tweet.find;
  let ruleQueryUser = null;

  try {
    FeedRule.find = (q) => {
      ruleQueryUser = String(q.user);
      if (ruleQueryUser === String(userA._id)) {
        return mockQuery([{ ruleType: "hide_media", targetType: null, target: null, expiresAt: null }]);
      }
      return mockQuery([]); // User B has no rules
    };

    let userAQuery = null;
    Tweet.find = (q) => {
      userAQuery = q;
      return mockQuery([]);
    };

    // User A feed
    await getFeed(userA, { mode: "foryou" });
    assert.equal(ruleQueryUser, String(userA._id));
    assert.deepEqual(userAQuery.image, { $in: [null, ""] });

    // User B feed
    let userBQuery = null;
    Tweet.find = (q) => {
      userBQuery = q;
      return mockQuery([]);
    };
    await getFeed(userB, { mode: "foryou" });
    assert.equal(ruleQueryUser, String(userB._id));
    assert.equal(userBQuery.image, undefined, "User B's query must not have hide_media from User A");
  } finally {
    FeedRule.find = origRuleFind;
    Tweet.find = origTweetFind;
  }
});

test("POST SIMULATION: Hidden + visible topic, image, audio, and text-only post filtering logic", () => {
  const hiddenTopicId = "topic_ai";
  const visibleTopicId = "topic_web";

  // Simulate posts
  const posts = [
    { _id: "1", content: "Post with AI and Web", topics: [hiddenTopicId, visibleTopicId], image: null, audio: null },
    { _id: "2", content: "Post with Web only", topics: [visibleTopicId], image: null, audio: null },
    { _id: "3", content: "Image post", topics: [visibleTopicId], image: "http://example.com/img.png", audio: null },
    { _id: "4", content: "Audio post", topics: [visibleTopicId], image: null, audio: "http://example.com/audio.mp3" },
    { _id: "5", content: "Text only post", topics: [visibleTopicId], image: null, audio: null },
  ];

  // Rule 1: hide_topic AI
  const afterHideTopic = posts.filter(p => !p.topics.includes(hiddenTopicId));
  assert.equal(afterHideTopic.length, 4);
  assert(!afterHideTopic.some(p => p._id === "1"), "Post with hidden + visible topic must be filtered out");

  // Rule 2: hide_media
  const afterHideMedia = afterHideTopic.filter(p => !p.image && !p.audio);
  assert.equal(afterHideMedia.length, 2);
  assert(afterHideMedia.some(p => p._id === "2"));
  assert(afterHideMedia.some(p => p._id === "5"));
  assert(!afterHideMedia.some(p => p._id === "3"), "Image post must be filtered out");
  assert(!afterHideMedia.some(p => p._id === "4"), "Audio post must be filtered out");
});

test("PAGINATION: Preserves cursor ordering and stability with active rules", async () => {
  const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111"), following: [] };

  const origRuleFind = FeedRule.find;
  const origTweetFind = Tweet.find;

  try {
    FeedRule.find = () => mockQuery([{ ruleType: "hide_media", targetType: null, target: null, expiresAt: null }]);

    const page1Tweets = [
      { _id: new mongoose.Types.ObjectId("888888888888888888888881"), timestamp: new Date("2026-10-15T10:00:00Z"), content: "P1" },
      { _id: new mongoose.Types.ObjectId("888888888888888888888882"), timestamp: new Date("2026-10-15T09:00:00Z"), content: "P2" },
      { _id: new mongoose.Types.ObjectId("888888888888888888888883"), timestamp: new Date("2026-10-15T08:00:00Z"), content: "P3" },
    ];
    Tweet.find = () => mockQuery([...page1Tweets]);

    const page1 = await getFeed(principal, { mode: "foryou", limit: 2 });
    assert.equal(page1.tweets.length, 2);
    assert(page1.nextCursor, "Page 1 must return nextCursor");

    // Decoding nextCursor verifies timestamp and ID
    const decoded = JSON.parse(Buffer.from(page1.nextCursor, "base64url").toString("utf8"));
    assert.equal(decoded.id, "888888888888888888888882");
    assert.equal(decoded.t, "2026-10-15T09:00:00.000Z");
  } finally {
    FeedRule.find = origRuleFind;
    Tweet.find = origTweetFind;
  }
});
