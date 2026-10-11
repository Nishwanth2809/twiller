import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Topic from "../models/topic.js";
import TopicFollow from "../models/topicFollow.js";
import Tweet from "../models/tweet.js";
import User from "../models/user.js";
import { deletePost } from "../post-operations.js";

// This utility never reads .env or accepts a connection URI.
const URI = "mongodb://127.0.0.1:27017/twiller_phase3_acceptance?replicaSet=phase1";
const seedTag = "TWILLER_TOPICS_BATCH2_V1";
const stableId = value => new mongoose.Types.ObjectId(createHash("sha256").update(`${seedTag}:${value}`).digest("hex").slice(0, 24));
const [action, username, slug = "ai-ml"] = process.argv.slice(2);
if (!action || action === "--help") {
  console.log("Local Topics utility (loopback acceptance database only)\n  node scripts/topics-seed.mjs seed\n  node scripts/topics-seed.mjs pagination <test-username> [topic-slug]\n  node scripts/topics-seed.mjs pagination-cleanup <test-username>\n  node scripts/topics-seed.mjs cleanup\nSeed is repeatable. Pagination adds 32 identifiable posts without changing the user's quota. Clean pagination before removing topics.");
  process.exit(0);
}
if (!["seed", "pagination", "pagination-cleanup", "cleanup"].includes(action)) throw Error("Unsupported action");
if (action.startsWith("pagination") && !/^[a-z0-9_]{3,50}$/.test(username || "")) throw Error("An existing disposable test username is required");
try {
  await mongoose.connect(URI, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (mongoose.connection.name !== "twiller_phase3_acceptance" || hello.setName !== "phase1" || !hello.isWritablePrimary) throw Error("Expected isolated phase1 PRIMARY");
  const fixtures = JSON.parse(await readFile(new URL("./topics.dev.json", import.meta.url), "utf8"));
  if (action === "seed") {
    // Validate all fixture rows before writing anything.
    for (const fixture of fixtures) await new Topic(fixture).validate();
    for (const model of [Topic, TopicFollow]) { await model.createCollection(); await model.createIndexes(); }
    await Tweet.collection.createIndex({ topics: 1, parentId: 1, deletedAt: 1, timestamp: -1, _id: -1 });
    for (const fixture of fixtures) {
      const id = stableId(fixture.slug);
      const collision = await Topic.collection.findOne({ _id: id });
      if (collision && (collision.seedTag !== seedTag || collision.slug !== fixture.slug)) throw Error("Seed ID collision; existing record preserved");
      if (await Topic.exists({ slug: fixture.slug, _id: { $ne: id } })) continue;
      await Topic.collection.updateOne({ _id: id, seedTag }, { $setOnInsert: { ...fixture, status: "active", seedTag, createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z") } }, { upsert: true });
    }
    console.log("Local Topics ready; existing same-slug topics were preserved.");
  } else if (action.startsWith("pagination")) {
    const owner = await User.findOne({ username }).select("_id email");
    if (!owner || !/(@example\.(test|com)|@twiller\.com)$/i.test(owner.email)) throw Error("Use a disposable acceptance account");
    const marker = `${seedTag}:${owner._id}`;
    if (action === "pagination-cleanup") {
      const posts = await Tweet.collection.find({ seedTag: marker, author: owner._id }).project({ _id: 1 }).toArray();
      for (const post of posts) await deletePost(owner._id, String(post._id));
      console.log(`Cleaned ${posts.length} disposable pagination posts (reply parents are tombstoned if needed).`);
    } else {
      const topic = await Topic.findOne({ slug, status: "active" });
      if (!topic) throw Error("Seed the topic first");
      const baseTime = Date.now();
      for (let index = 1; index <= 32; index++) {
        const id = stableId(`${owner._id}:post:${index}`);
        const existing = await Tweet.collection.findOne({ _id: id });
        if (existing && existing.seedTag !== marker) throw Error("Seed post ID collision; existing record preserved");
        const value = { author: owner._id, content: `[TOPICS ACCEPTANCE ${String(index).padStart(2, "0")}] ${topic.name} pagination`, topics: [topic._id], timestamp: new Date(baseTime - index * 1000) };
        const post = new Tweet(value); await post.validate();
        await Tweet.collection.updateOne({ _id: id, seedTag: marker }, { $setOnInsert: { ...post.toObject(), _id: id, seedTag: marker } }, { upsert: true });
      }
      console.log(`32 identifiable topic-feed pagination posts ready for @${username}.`);
    }
  } else {
    const topics = await Topic.collection.find({ seedTag }).project({ _id: 1 }).toArray();
    const ids = topics.map(topic => topic._id);
    if (await Tweet.exists({ topics: { $in: ids }, deletedAt: null })) throw Error("Tagged posts remain. Clean pagination and remove disposable normal posts before topic cleanup.");
    await TopicFollow.deleteMany({ topic: { $in: ids } });
    await Topic.collection.deleteMany({ seedTag, _id: { $in: ids } });
    console.log(`Removed ${ids.length} seeded topics and their disposable follow relationships.`);
  }
} finally { await mongoose.disconnect(); }
