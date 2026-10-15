import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { getFeed, resolveFeedMode, FEED_MODES } from "../feed-operations.js";
import Tweet from "../models/tweet.js";
import Topic from "../models/topic.js";
import TopicFollow from "../models/topicFollow.js";
import Circle from "../models/circle.js";
import CircleMembership from "../models/circleMembership.js";

test("FEED_MODES and resolveFeedMode validation", () => {
  assert.deepEqual(FEED_MODES, ["foryou", "following", "topics", "circles"]);
  assert.equal(resolveFeedMode({}), "foryou");
  assert.equal(resolveFeedMode({ mode: "foryou" }), "foryou");
  assert.equal(resolveFeedMode({ mode: "following" }), "following");
  assert.equal(resolveFeedMode({ mode: "topics" }), "topics");
  assert.equal(resolveFeedMode({ mode: "circles" }), "circles");
  // Backward compatibility with type=
  assert.equal(resolveFeedMode({ type: "foryou" }), "foryou");
  assert.equal(resolveFeedMode({ type: "following" }), "following");
  // Invalid mode throws 400
  assert.throws(() => resolveFeedMode({ mode: "invalid" }), error => error.status === 400 && error.code === "INVALID_FEED_MODE");
  assert.throws(() => resolveFeedMode({ type: "invalid" }), error => error.status === 400 && error.code === "INVALID_FEED_MODE");
});

test("feed modes unauthenticated access enforcement", async () => {
  // foryou allows unauthenticated
  const originalFind = Tweet.find;
  try {
    const mockQuery = {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      populate() { this.result = []; return this; },
      then(resolve) { return Promise.resolve(this.result).then(resolve); }
    };
    Tweet.find = () => Object.create(mockQuery);

    const forYouRes = await getFeed(null, { mode: "foryou" });
    assert.equal(forYouRes.mode, "foryou");
    assert.deepEqual(forYouRes.tweets, []);

    // following, topics, circles require principal
    await assert.rejects(getFeed(null, { mode: "following" }), error => error.status === 401 && error.code === "AUTH_REQUIRED");
    await assert.rejects(getFeed(null, { mode: "topics" }), error => error.status === 401 && error.code === "AUTH_REQUIRED");
    await assert.rejects(getFeed(null, { mode: "circles" }), error => error.status === 401 && error.code === "AUTH_REQUIRED");
  } finally {
    Tweet.find = originalFind;
  }
});

test("following mode scopes query to principal's following list and self, ignoring caller-supplied userId", async () => {
  const originalFind = Tweet.find;
  let capturedQuery = null;
  try {
    const principal = {
      _id: new mongoose.Types.ObjectId("111111111111111111111111"),
      following: [new mongoose.Types.ObjectId("222222222222222222222222")]
    };
    const mockQuery = {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      populate() { this.result = []; return this; },
      then(resolve) { return Promise.resolve(this.result).then(resolve); }
    };
    Tweet.find = query => {
      capturedQuery = query;
      return Object.create(mockQuery);
    };

    const res = await getFeed(principal, { mode: "following", userId: "spoofed_user_id" });
    assert.equal(res.mode, "following");
    assert.equal(capturedQuery.parentId, null);
    assert.equal(capturedQuery.deletedAt, null);
    assert.deepEqual(capturedQuery.author.$in.map(String), [
      "222222222222222222222222",
      "111111111111111111111111"
    ]);
  } finally {
    Tweet.find = originalFind;
  }
});

test("topics mode returns honest empty feed when user has no followed topics", async () => {
  const originalTopicFollowFind = TopicFollow.find;
  try {
    const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
    TopicFollow.find = () => ({
      select: () => ({
        lean: async () => []
      })
    });
    const res = await getFeed(principal, { mode: "topics" });
    assert.equal(res.mode, "topics");
    assert.deepEqual(res.tweets, []);
    assert.equal(res.hasMore, false);
    assert.equal(res.nextCursor, null);
  } finally {
    TopicFollow.find = originalTopicFollowFind;
  }
});

test("topics mode filters by active followed topics, deduplicating posts with multiple topics", async () => {
  const originalTopicFollowFind = TopicFollow.find;
  const originalTopicFind = Topic.find;
  const originalTweetFind = Tweet.find;
  let capturedQuery = null;
  try {
    const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
    const topic1Id = new mongoose.Types.ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
    const topic2Id = new mongoose.Types.ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");

    TopicFollow.find = () => ({
      select: () => ({
        lean: async () => [{ topic: topic1Id }, { topic: topic2Id }]
      })
    });

    Topic.find = () => ({
      select: () => ({
        lean: async () => [{ _id: topic1Id }, { _id: topic2Id }]
      })
    });

    const mockPost = {
      _id: new mongoose.Types.ObjectId("cccccccccccccccccccccccc"),
      content: "Post with two topics",
      topics: [topic1Id, topic2Id],
      timestamp: new Date()
    };

    const mockQuery = {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      populate() { this.result = [mockPost]; return this; },
      then(resolve) { return Promise.resolve(this.result).then(resolve); }
    };
    Tweet.find = query => {
      capturedQuery = query;
      return Object.create(mockQuery);
    };

    const res = await getFeed(principal, { mode: "topics" });
    assert.equal(res.mode, "topics");
    assert.equal(res.tweets.length, 1);
    assert.deepEqual(capturedQuery.topics.$in.map(String), [String(topic1Id), String(topic2Id)]);
  } finally {
    TopicFollow.find = originalTopicFollowFind;
    Topic.find = originalTopicFind;
    Tweet.find = originalTweetFind;
  }
});

test("circles mode returns honest empty feed when user has no joined circles", async () => {
  const originalCircleMembershipFind = CircleMembership.find;
  try {
    const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
    CircleMembership.find = () => ({
      select: () => ({
        lean: async () => []
      })
    });
    const res = await getFeed(principal, { mode: "circles" });
    assert.equal(res.mode, "circles");
    assert.deepEqual(res.tweets, []);
    assert.equal(res.hasMore, false);
    assert.equal(res.nextCursor, null);
  } finally {
    CircleMembership.find = originalCircleMembershipFind;
  }
});

test("circles mode scopes query to active joined circles only and immediately excludes left circles", async () => {
  const originalCircleMembershipFind = CircleMembership.find;
  const originalCircleFind = Circle.find;
  const originalTweetFind = Tweet.find;
  let capturedQuery = null;
  try {
    const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111") };
    const circle1Id = new mongoose.Types.ObjectId("121212121212121212121212");

    CircleMembership.find = () => ({
      select: () => ({
        lean: async () => [{ circle: circle1Id }]
      })
    });

    Circle.find = () => ({
      select: () => ({
        lean: async () => [{ _id: circle1Id }]
      })
    });

    const mockQuery = {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      populate() { this.result = []; return this; },
      then(resolve) { return Promise.resolve(this.result).then(resolve); }
    };
    Tweet.find = query => {
      capturedQuery = query;
      return Object.create(mockQuery);
    };

    const res = await getFeed(principal, { mode: "circles" });
    assert.equal(res.mode, "circles");
    assert.deepEqual(capturedQuery.circle.$in.map(String), [String(circle1Id)]);
  } finally {
    CircleMembership.find = originalCircleMembershipFind;
    Circle.find = originalCircleFind;
    Tweet.find = originalTweetFind;
  }
});

test("mode and legacy type conflict rejection", () => {
  // Conflicting mode and type must reject with 400 FEED_MODE_CONFLICT
  assert.throws(() => resolveFeedMode({ mode: "foryou", type: "following" }), error => error.status === 400 && error.code === "FEED_MODE_CONFLICT");
  assert.throws(() => resolveFeedMode({ mode: "topics", type: "foryou" }), error => error.status === 400 && error.code === "FEED_MODE_CONFLICT");
  assert.throws(() => resolveFeedMode({ mode: "circles", type: "following" }), error => error.status === 400 && error.code === "FEED_MODE_CONFLICT");

  // Matching mode and type are accepted
  assert.equal(resolveFeedMode({ mode: "foryou", type: "foryou" }), "foryou");
  assert.equal(resolveFeedMode({ mode: "following", type: "following" }), "following");
});

test("legacy type alias conditional authentication and principal isolation", async () => {
  const originalFind = Tweet.find;
  try {
    const mockQuery = {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      populate() { this.result = []; return this; },
      then(resolve) { return Promise.resolve(this.result).then(resolve); }
    };
    Tweet.find = () => Object.create(mockQuery);

    // type=foryou allows anonymous
    const res = await getFeed(null, { type: "foryou" });
    assert.equal(res.mode, "foryou");

    // type=following requires authentication
    await assert.rejects(getFeed(null, { type: "following" }), error => error.status === 401 && error.code === "AUTH_REQUIRED");

    // type=following with principal works
    const principal = { _id: new mongoose.Types.ObjectId("111111111111111111111111"), following: [] };
    const authRes = await getFeed(principal, { type: "following" });
    assert.equal(authRes.mode, "following");
  } finally {
    Tweet.find = originalFind;
  }
});

test("feed cursor pagination and limit bounds enforcement", async () => {
  const originalFind = Tweet.find;
  let capturedLimit = null;
  let capturedSkip = null;
  try {
    const mockQuery = {
      sort() { return this; },
      skip(s) { capturedSkip = s; return this; },
      limit(l) { capturedLimit = l; return this; },
      populate() { this.result = []; return this; },
      then(resolve) { return Promise.resolve(this.result).then(resolve); }
    };
    Tweet.find = () => Object.create(mockQuery);

    // Oversized limit is clamped to 100 (+1 for hasMore check)
    await getFeed(null, { mode: "foryou", limit: 999 });
    assert.equal(capturedLimit, 101);

    // Negative limit clamped to 1 (+1 = 2)
    await getFeed(null, { mode: "foryou", limit: -5 });
    assert.equal(capturedLimit, 2);

    // Default limit is 20 (+1 = 21)
    await getFeed(null, { mode: "foryou" });
    assert.equal(capturedLimit, 21);
  } finally {
    Tweet.find = originalFind;
  }
});
