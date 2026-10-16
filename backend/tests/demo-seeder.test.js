import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import mongoose from "mongoose";
import User from "../models/user.js";
import Tweet from "../models/tweet.js";
import Topic from "../models/topic.js";
import TopicFollow from "../models/topicFollow.js";
import Circle from "../models/circle.js";
import CircleMembership from "../models/circleMembership.js";
import Media from "../models/media.js";
import {
  runDemoSeeder,
  DEMO_USERS,
  DEMO_TOPICS,
  DEMO_CIRCLES,
  DEMO_POSTS,
  DEMO_REPLIES,
  DEMO_SEED_TAG,
  stableId,
} from "../scripts/seed-demo-content.mjs";

test("Demo Seeder Safety: refuses execution without confirmation", async () => {
  await assert.rejects(
    runDemoSeeder({
      uri: "mongodb://127.0.0.1:27017/twiller_test",
      env: { TWILLER_DEMO_SEED_CONFIRM: "false" },
      args: [],
    }),
    error => error.message.includes("explicit confirmation required")
  );
});

test("Demo Seeder Safety: refuses production database without production confirmation", async () => {
  await assert.rejects(
    runDemoSeeder({
      uri: "mongodb+srv://cluster.mongodb.net/twiller_production",
      env: {
        TWILLER_DEMO_SEED_CONFIRM: "true",
        NODE_ENV: "production",
      },
      args: ["--confirm"],
    }),
    error => error.message.includes("second explicit confirmation required")
  );
});

test("Demo Seeder: Dry run mode reports operations and writes zero records", async () => {
  const result = await runDemoSeeder({
    uri: "mongodb://127.0.0.1:27017/twiller_test",
    env: {
      TWILLER_DEMO_SEED_DRY_RUN: "true",
    },
    args: ["--dry-run"],
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.usersCount, 8);
  assert.equal(result.postsCount, 28);
  assert.equal(result.repliesCount, 14);
  assert.equal(result.topicsCount, 8);
  assert.equal(result.circlesCount, 4);
});

test("Demo Seeder In-Memory Engine: Full Execution, Ingestion, and Idempotency", async () => {
  // In-memory collections to test full logic and idempotency without external network
  const usersStore = new Map();
  const tweetsStore = new Map();
  const topicsStore = new Map();
  const topicFollowsStore = new Map();
  const circlesStore = new Map();
  const circleMembershipsStore = new Map();
  const mediaStore = new Map();
  const gridFsFiles = new Map();

  // Add a pre-existing REAL user to prove the seeder never touches or overwrites real users
  const realUserId = new mongoose.Types.ObjectId();
  usersStore.set(String(realUserId), {
    _id: realUserId,
    username: "real_operator",
    displayName: "Real Platform Operator",
    email: "operator@twiller.com",
    role: "admin",
    accountStatus: "active",
    plan: "gold",
    followers: [],
    following: [],
    bookmarks: [],
    seedTag: undefined, // Real user does not have demo seedTag
  });

  const originalMongooseState = mongoose.connection.readyState;
  mongoose.connection.readyState = 1;
  mongoose.connection.db = {
    databaseName: "twiller_staging",
  };

  // Mock collections
  const originalUserColl = User.collection;
  const originalUserFindOne = User.findOne;
  const originalTweetColl = Tweet.collection;
  const originalTopicColl = Topic.collection;
  const originalTopicFindOne = Topic.findOne;
  const originalTopicFollowColl = TopicFollow.collection;
  const originalCircleColl = Circle.collection;
  const originalCircleFindOne = Circle.findOne;
  const originalCircleMembershipColl = CircleMembership.collection;
  const originalMediaColl = Media.collection;

  User.collection = {
    countDocuments: async query => {
      let count = 0;
      for (const u of usersStore.values()) {
        if (query.seedTag && u.seedTag === query.seedTag) count++;
        else if (query.author && String(u.author) === String(query.author)) count++;
      }
      return count;
    },
    updateOne: async (filter, update, options) => {
      const id = String(filter._id);
      let doc = usersStore.get(id);
      if (!doc && options?.upsert) {
        doc = { _id: filter._id, ...(update.$setOnInsert || {}) };
        usersStore.set(id, doc);
      }
      if (doc) {
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$addToSet) {
          for (const [k, v] of Object.entries(update.$addToSet)) {
            doc[k] = doc[k] || [];
            if (!doc[k].some(existing => String(existing) === String(v))) {
              doc[k].push(v);
            }
          }
        }
      }
      return { matchedCount: doc ? 1 : 0 };
    },
  };
  User.findOne = async query => {
    for (const u of usersStore.values()) {
      if (query.username && u.username === query.username) return u;
      if (query._id && String(u._id) === String(query._id)) return u;
    }
    return null;
  };

  Tweet.collection = {
    countDocuments: async query => {
      let count = 0;
      for (const t of tweetsStore.values()) {
        if (query.seedTag && t.seedTag === query.seedTag) count++;
        if (query.author && String(t.author) === String(query.author)) count++;
      }
      return count;
    },
    updateOne: async (filter, update, options) => {
      const id = String(filter._id);
      let doc = tweetsStore.get(id);
      if (!doc && options?.upsert) {
        doc = { _id: filter._id, ...(update.$setOnInsert || {}) };
        tweetsStore.set(id, doc);
      }
      if (doc && update.$set) Object.assign(doc, update.$set);
      return { matchedCount: doc ? 1 : 0 };
    },
  };

  Topic.collection = {
    updateOne: async (filter, update, options) => {
      const id = String(filter._id);
      let doc = topicsStore.get(id);
      if (!doc && options?.upsert) {
        doc = { _id: filter._id, ...(update.$setOnInsert || {}) };
        topicsStore.set(id, doc);
      }
      if (doc && update.$set) Object.assign(doc, update.$set);
      return { matchedCount: doc ? 1 : 0 };
    },
  };
  Topic.findOne = async query => {
    for (const t of topicsStore.values()) {
      if (query.slug && t.slug === query.slug) return t;
    }
    return null;
  };

  TopicFollow.collection = {
    updateOne: async (filter, update, options) => {
      const key = `${filter.user}:${filter.topic}`;
      let doc = topicFollowsStore.get(key);
      if (!doc && options?.upsert) {
        doc = { ...(update.$setOnInsert || filter) };
        topicFollowsStore.set(key, doc);
      }
      return { matchedCount: doc ? 1 : 0 };
    },
  };

  Circle.collection = {
    updateOne: async (filter, update, options) => {
      const id = String(filter._id);
      let doc = circlesStore.get(id);
      if (!doc && options?.upsert) {
        doc = { _id: filter._id, ...(update.$setOnInsert || {}) };
        circlesStore.set(id, doc);
      }
      if (doc && update.$set) Object.assign(doc, update.$set);
      return { matchedCount: doc ? 1 : 0 };
    },
  };
  Circle.findOne = async query => {
    for (const c of circlesStore.values()) {
      if (query.slug && c.slug === query.slug) return c;
    }
    return null;
  };

  CircleMembership.collection = {
    updateOne: async (filter, update, options) => {
      const key = `${filter.circle}:${filter.user}`;
      let doc = circleMembershipsStore.get(key);
      if (!doc && options?.upsert) {
        doc = { ...(update.$setOnInsert || filter) };
        circleMembershipsStore.set(key, doc);
      }
      return { matchedCount: doc ? 1 : 0 };
    },
  };

  Media.collection = {
    updateOne: async (filter, update, options) => {
      const id = String(filter._id);
      let doc = mediaStore.get(id);
      if (!doc && options?.upsert) {
        doc = { _id: filter._id, ...(update.$setOnInsert || {}) };
        mediaStore.set(id, doc);
      }
      if (doc && update.$set) Object.assign(doc, update.$set);
      return { matchedCount: doc ? 1 : 0 };
    },
  };

  try {
    const mockBucket = {
      find: (query) => ({
        limit: () => ({
          hasNext: async () => gridFsFiles.has(String(query._id)),
        }),
      }),
      openUploadStreamWithId: (id, filename) => {
        const chunks = [];
        return new (class extends Writable {
          _write(chunk, enc, cb) {
            chunks.push(chunk);
            cb();
          }
          _final(cb) {
            gridFsFiles.set(String(id), Buffer.concat(chunks));
            cb();
          }
        })();
      },
    };

    // RUN 1: INITIAL SEED
    const run1 = await runDemoSeeder({
      uri: "mongodb+srv://cluster.mongodb.net/twiller_staging",
      env: {
        TWILLER_DEMO_SEED_CONFIRM: "true",
        TWILLER_DEPLOYMENT_STAGE: "staging",
        MEDIA_STORAGE: "database",
      },
      args: ["--confirm"],
      bucket: mockBucket,
    });

    assert.equal(run1.usersCount, 8);
    assert.equal(run1.postsCount, 28);
    assert.equal(run1.imagePostsCount, 11);
    assert.equal(run1.repliesCount, 14);
    assert.equal(run1.topicsCount, 8);
    assert.equal(run1.circlesCount, 4);
    assert.equal(run1.totalPostsCount, 42);

    // 1. Verify Real User Untouched
    const preservedRealUser = usersStore.get(String(realUserId));
    assert.ok(preservedRealUser);
    assert.equal(preservedRealUser.username, "real_operator");
    assert.equal(preservedRealUser.seedTag, undefined);

    // 2. Verify Demo Users
    assert.equal(usersStore.size, 9); // 8 demo + 1 real
    const maya = [...usersStore.values()].find(u => u.username === "mayacodes");
    assert.ok(maya);
    assert.equal(maya.displayName, "Maya Chen");
    assert.equal(maya.seedTag, DEMO_SEED_TAG);
    assert.equal(maya.accountStatus, "active");
    assert.match(maya.avatar, /\/media\/[a-f0-9]{24}$/);
    assert.ok(maya.following.length > 0);
    assert.ok(maya.followers.length > 0);

    // 3. Verify Topics & Topic Follows
    assert.equal(topicsStore.size, 8);
    const aiTopic = [...topicsStore.values()].find(t => t.slug === "ai-ml");
    assert.ok(aiTopic);
    assert.equal(aiTopic.seedTag, DEMO_SEED_TAG);
    assert.ok(topicFollowsStore.size >= 8);

    // 4. Verify Circles & Memberships
    assert.equal(circlesStore.size, 4);
    const aiBuildersCircle = [...circlesStore.values()].find(c => c.slug === "ai-builders");
    assert.ok(aiBuildersCircle);
    assert.equal(String(aiBuildersCircle.owner), String(maya._id));
    const ownerMembership = circleMembershipsStore.get(`${aiBuildersCircle._id}:${maya._id}`);
    assert.ok(ownerMembership);
    assert.equal(ownerMembership.role, "owner");

    // 5. Verify Posts & Images
    const rootPosts = [...tweetsStore.values()].filter(t => !t.parentId);
    assert.equal(rootPosts.length, 28);
    const imagePosts = rootPosts.filter(t => t.image);
    assert.equal(imagePosts.length, 11);

    // 6. Verify Replies & Conversation Threads
    const replies = [...tweetsStore.values()].filter(t => t.parentId);
    assert.equal(replies.length, 14);

    // Check thread 1 on Maya's post
    const post1 = rootPosts.find(p => p.content.includes("comparing retrieval strategies"));
    assert.ok(post1);
    assert.equal(post1.comments, 3); // 3 replies attached to post 1

    // 7. Verify Echoes / Retweets
    const echoedPosts = rootPosts.filter(p => p.retweets > 0);
    assert.ok(echoedPosts.length >= 5);
    const post2 = rootPosts.find(p => p.content.includes("six nested conditionals"));
    assert.ok(post2.retweets >= 4);
    assert.equal(post2.retweetedBy.length, post2.retweets);

    // 8. Verify Quote Echoes
    const quoteEcho = rootPosts.find(p => p.content.includes("Echoing @arjunbuilds on nested conditionals"));
    assert.ok(quoteEcho);

    // 9. Verify Media Records
    assert.equal(mediaStore.size, 19); // 8 avatars + 11 post images
    for (const m of mediaStore.values()) {
      assert.equal(m.published, true);
      assert.equal(m.kind, "image");
      assert.equal(m.mime, "image/jpeg");
      assert.equal(m.seedTag, DEMO_SEED_TAG);
    }

    // RUN 2: IDEMPOTENCY CHECK (Rerunning must not duplicate records)
    const run2 = await runDemoSeeder({
      uri: "mongodb+srv://cluster.mongodb.net/twiller_staging",
      env: {
        TWILLER_DEMO_SEED_CONFIRM: "true",
        TWILLER_DEPLOYMENT_STAGE: "staging",
        MEDIA_STORAGE: "database",
      },
      args: ["--confirm"],
      bucket: mockBucket,
    });

    // Counts must remain identical
    assert.equal(usersStore.size, 9);
    assert.equal(topicsStore.size, 8);
    assert.equal(circlesStore.size, 4);
    assert.equal(tweetsStore.size, 42); // 28 root + 14 replies
    assert.equal(mediaStore.size, 19);
    assert.equal(run2.totalPostsCount, 42);

  } finally {
    // Restore mocks
    mongoose.connection.readyState = originalMongooseState;
    User.collection = originalUserColl;
    User.findOne = originalUserFindOne;
    Tweet.collection = originalTweetColl;
    Topic.collection = originalTopicColl;
    Topic.findOne = originalTopicFindOne;
    TopicFollow.collection = originalTopicFollowColl;
    Circle.collection = originalCircleColl;
    Circle.findOne = originalCircleFindOne;
    CircleMembership.collection = originalCircleMembershipColl;
    Media.collection = originalMediaColl;
  }
});
