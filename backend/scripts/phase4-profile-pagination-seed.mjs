import { createHash } from "node:crypto";
import mongoose from "mongoose";
import User from "../models/user.js";
import Tweet from "../models/tweet.js";

// Deliberately fixed: this utility never reads .env or a caller-supplied URI.
const ACCEPTANCE_URI = "mongodb://127.0.0.1:27017/twiller_phase3_acceptance?replicaSet=phase1";
const POST_COUNT = 27;
const RELATION_COUNT = 48;
const PAGE_SIZE = 20;

function usage() {
  console.log(`Local TW-021 profile pagination data only\n\nUsage:\n  node scripts/phase4-profile-pagination-seed.mjs seed <existing-test-username>\n  node scripts/phase4-profile-pagination-seed.mjs cleanup <existing-test-username>\n\nCreates ${POST_COUNT} top-level posts, ${POST_COUNT} replies, ${RELATION_COUNT} followers, and ${RELATION_COUNT} following records. The URI is fixed to 127.0.0.1:27017/twiller_phase3_acceptance (replica set phase1).`);
}

function stableId(key) {
  return new mongoose.Types.ObjectId(createHash("sha256").update(key).digest("hex").slice(0, 24));
}

function safeIdPart(id) {
  return String(id).slice(-10).toLowerCase();
}

function makePlan(target) {
  const targetId = String(target._id);
  const usernameTag = safeIdPart(targetId);
  const seedTag = `TWILLER_PHASE4_PAGINATION_${usernameTag}`;
  const users = [];
  const followerIds = [];
  const followingIds = [];

  for (const [kind, ids] of [["follower", followerIds], ["following", followingIds]]) {
    for (let index = 1; index <= RELATION_COUNT; index += 1) {
      const number = String(index).padStart(2, "0");
      const key = `twiller-phase4-pagination:${targetId}:${kind}:${number}`;
      const _id = stableId(`${key}:user`);
      const username = `p4pag_${kind === "follower" ? "f" : "g"}_${usernameTag}_${number}`;
      const email = `p4-pagination-${kind}-${usernameTag}-${number}@example.test`;
      ids.push(_id);
      users.push({
        _id,
        username,
        email,
        displayName: `P4 Pagination ${kind} ${number}`,
        joinedDate: new Date(Date.UTC(2025, 0, 1) + index * 60_000),
        ...(kind === "follower" ? { following: [target._id] } : { followers: [target._id] }),
      });
    }
  }

  const posts = [];
  const replies = [];
  const startedAt = Date.now();
  for (let index = 1; index <= POST_COUNT; index += 1) {
    const number = String(index).padStart(2, "0");
    const postId = stableId(`twiller-phase4-pagination:${targetId}:post:${number}`);
    const replyId = stableId(`twiller-phase4-pagination:${targetId}:reply:${number}`);
    const timestamp = new Date(startedAt - (index - 1) * 60_000);
    posts.push({
      _id: postId,
      author: target._id,
      content: `[${seedTag}] test post ${number}`,
      timestamp,
      parentId: null,
      image: null,
      audio: null,
    });
    replies.push({
      _id: replyId,
      author: target._id,
      content: `[${seedTag}] test reply ${number}`,
      timestamp,
      parentId: postId,
      image: null,
      audio: null,
    });
  }

  return { targetId, seedTag, users, followerIds, followingIds, posts, replies };
}

async function assertNoIdCollisions(plan, session) {
  const existingUsers = await User.find({ _id: { $in: plan.users.map(user => user._id) } })
    .select("_id username email").session(session).lean();
  for (const existing of existingUsers) {
    const expected = plan.users.find(user => String(user._id) === String(existing._id));
    if (!expected || expected.username !== existing.username || expected.email !== existing.email) {
      throw new Error("A deterministic test-user ID is occupied by a different record; no seed data was changed.");
    }
  }

  const plannedTweets = [...plan.posts, ...plan.replies];
  const existingTweets = await Tweet.find({ _id: { $in: plannedTweets.map(tweet => tweet._id) } })
    .select("_id author content").session(session).lean();
  for (const existing of existingTweets) {
    const expected = plannedTweets.find(tweet => String(tweet._id) === String(existing._id));
    if (!expected || String(existing.author) !== plan.targetId || existing.content !== expected.content) {
      throw new Error("A deterministic test-post ID is occupied by a different record; no seed data was changed.");
    }
  }
}

async function seed(plan, session) {
  await assertNoIdCollisions(plan, session);

  await User.bulkWrite(plan.users.map(user => ({
    updateOne: {
      filter: { _id: user._id },
      update: { $setOnInsert: user },
      upsert: true,
    },
  })), { session, ordered: true });

  await Tweet.bulkWrite([...plan.posts, ...plan.replies].map(tweet => ({
    updateOne: {
      filter: { _id: tweet._id },
      update: { $setOnInsert: tweet },
      upsert: true,
    },
  })), { session, ordered: true });

  await User.updateOne(
    { _id: plan.targetId },
    { $addToSet: { followers: { $each: plan.followerIds }, following: { $each: plan.followingIds } } },
    { session },
  );
}

async function cleanup(plan, session) {
  await assertNoIdCollisions(plan, session);
  const userIds = plan.users.map(user => user._id);
  const tweetIds = [...plan.posts, ...plan.replies].map(tweet => tweet._id);

  await User.updateOne(
    { _id: plan.targetId },
    { $pull: { followers: { $in: userIds }, following: { $in: userIds } } },
    { session },
  );
  await Tweet.deleteMany({ _id: { $in: tweetIds }, author: plan.targetId }, { session });
  await User.deleteMany({ _id: { $in: userIds } }, { session });
}

const [action, requestedUsername] = process.argv.slice(2);
if (action === "--help" || action === "-h" || !action) {
  usage();
  process.exit(0);
}
if (!new Set(["seed", "cleanup"]).has(action) || !/^[a-z0-9_]{3,50}$/i.test(requestedUsername || "")) {
  usage();
  process.exitCode = 2;
} else {
  try {
    await mongoose.connect(ACCEPTANCE_URI, { serverSelectionTimeoutMS: 5_000 });
    const connection = mongoose.connection;
    if (connection.host !== "127.0.0.1" || connection.port !== 27017 || connection.name !== "twiller_phase3_acceptance") {
      throw new Error("Refusing to continue: connection is not the fixed local acceptance database.");
    }
    const hello = await connection.db.admin().command({ hello: 1 });
    if (hello.setName !== "phase1" || hello.isWritablePrimary !== true) {
      throw new Error("Refusing to write: local replica set phase1 is not PRIMARY.");
    }

    const escapedUsername = requestedUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const target = await User.findOne({ username: new RegExp(`^${escapedUsername}$`, "i") }).select("_id username").lean();
    if (!target) throw new Error("The specified existing local acceptance user was not found; no records were changed.");
    const plan = makePlan(target);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (action === "seed") await seed(plan, session);
        else await cleanup(plan, session);
      });
    } finally {
      await session.endSession();
    }

    if (action === "seed") {
      console.log(`Seed complete for @${target.username}: ${POST_COUNT} marked top-level posts, ${POST_COUNT} marked replies, ${RELATION_COUNT} followers, ${RELATION_COUNT} following. Re-running is safe.`);
      console.log(`All generated content is visibly marked [${plan.seedTag}]. Cleanup command: node scripts/phase4-profile-pagination-seed.mjs cleanup ${target.username}`);
    } else {
      console.log(`Cleanup complete for @${target.username}: only deterministic pagination-seed posts, replies, and synthetic relationship accounts were removed.`);
    }
  } catch (error) {
    console.error(`Pagination seed ${action} failed safely: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
