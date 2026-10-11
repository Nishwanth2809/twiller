import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Circle from "../models/circle.js";
import CircleMembership from "../models/circleMembership.js";
import Topic from "../models/topic.js";
import Tweet from "../models/tweet.js";
import User from "../models/user.js";

// No .env import or configurable URI: this utility can only reach the disposable loopback database.
const URI = "mongodb://127.0.0.1:27017/twiller_phase3_acceptance?replicaSet=phase1";
const marker = "TWILLER_CIRCLES_BATCH3_V1";
const stableId = value => new mongoose.Types.ObjectId(createHash("sha256").update(`${marker}:${value}`).digest("hex").slice(0, 24));
const [action, username, slug = "ai-builders"] = process.argv.slice(2);
if (!action || action === "--help") {
  console.log("Local Circles utility (loopback acceptance database only)\n  node scripts/circles-seed.mjs seed <disposable-owner-username>\n  node scripts/circles-seed.mjs pagination <disposable-member-username> [circle-slug]\n  node scripts/circles-seed.mjs pagination-cleanup <disposable-member-username>\n  node scripts/circles-seed.mjs quota-open <disposable-username>\n  node scripts/circles-seed.mjs quota-close <disposable-username>\n  node scripts/circles-seed.mjs cleanup");
  process.exit(0);
}
if (!["seed", "pagination", "pagination-cleanup", "quota-open", "quota-close", "cleanup"].includes(action)) throw Error("Unsupported action");
if (action !== "cleanup" && !/^[a-z0-9_]{3,50}$/.test(username || "")) throw Error("An existing disposable test username is required");
try {
  await mongoose.connect(URI, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (mongoose.connection.name !== "twiller_phase3_acceptance" || hello.setName !== "phase1" || !hello.isWritablePrimary) throw Error("Expected isolated phase1 PRIMARY");
  const user = username ? await User.findOne({ username }).select("_id email") : null;
  if (username && (!user || !/(@example\.(test|com)|@twiller\.com)$/i.test(user.email))) throw Error("Use an existing disposable acceptance account");
  if (action === "quota-open") {
    const raw = await User.collection.findOne({ _id: user._id });
    if (raw.circleAcceptanceQuotaOriginal || raw.plan !== "free") throw Error("Acceptance quota fixture already active or account is not free");
    const fields = ["plan", "planExpiresAt", "planActivatedAt", "quotaStartsAt", "quotaResetsAt", "tweetCount"];
    const values = Object.fromEntries(fields.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]));
    const absent = fields.filter(key => !Object.hasOwn(raw, key));
    const now = new Date(); const expires = new Date(now.getTime() + 60 * 60 * 1000);
    const changed = await User.collection.updateOne({ _id: user._id, plan: "free", circleAcceptanceQuotaOriginal: { $exists: false } },
      { $set: { circleAcceptanceQuotaOriginal: { values, absent, openedAt: now }, plan: "gold", planExpiresAt: expires, planActivatedAt: now, quotaStartsAt: now, quotaResetsAt: expires } });
    if (changed.modifiedCount !== 1) throw Error("Account changed before fixture could start");
    console.log(`Disposable local quota fixture opened for @${username}; restore it after Circle posting.`);
  } else if (action === "quota-close") {
    const raw = await User.collection.findOne({ _id: user._id });
    const snapshot = raw.circleAcceptanceQuotaOriginal;
    if (!snapshot || raw.plan !== "gold") throw Error("No active Circle quota fixture for this account");
    const values = { ...snapshot.values, tweetCount: Math.max(snapshot.values.tweetCount || 0, raw.tweetCount || 0) };
    const unset = Object.fromEntries([...snapshot.absent.filter(key => key !== "tweetCount"), "circleAcceptanceQuotaOriginal"].map(key => [key, ""]));
    const changed = await User.collection.updateOne({ _id: user._id, circleAcceptanceQuotaOriginal: { $exists: true }, plan: "gold" }, { $set: values, $unset: unset });
    if (changed.modifiedCount !== 1) throw Error("Account changed before fixture could close");
    console.log(`Disposable local quota fixture closed for @${username}; original free plan restored with used-post count retained.`);
  } else if (action === "seed") {
    const fixtures = JSON.parse(await readFile(new URL("./circles.dev.json", import.meta.url), "utf8"));
    for (const row of fixtures) await new Circle({ _id: stableId(row.slug), name: row.name, slug: row.slug, description: row.description, owner: user._id }).validate();
    for (const model of [Circle, CircleMembership]) { await model.createCollection(); await model.createIndexes(); }
    for (const row of fixtures) {
      const circleId = stableId(row.slug);
      const collision = await Circle.collection.findOne({ _id: circleId });
      if (collision && (collision.seedTag !== marker || collision.slug !== row.slug)) throw Error("Seed ID collision; existing record preserved");
      const existing = await Circle.findOne({ slug: row.slug }).select("_id");
      if (existing && String(existing._id) !== String(circleId)) continue;
      const topics = await Topic.find({ slug: { $in: row.topics }, status: "active" }).select("_id slug");
      await mongoose.connection.transaction(async session => {
        await Circle.collection.updateOne({ _id: circleId, seedTag: marker }, { $setOnInsert: { slug: row.slug, name: row.name, description: row.description, owner: user._id, visibility: "public", status: "active", relatedTopics: topics.map(topic => topic._id), createdAt: new Date(), updatedAt: new Date(), seedTag: marker } }, { upsert: true, session });
        await CircleMembership.collection.updateOne({ circle: circleId, user: user._id }, { $setOnInsert: { role: "owner", joinedAt: new Date(), seedTag: marker } }, { upsert: true, session });
      });
    }
    console.log("Local Circles ready; existing same-slug Circles were preserved.");
  } else if (action === "pagination") {
    const circle = await Circle.findOne({ slug, status: "active", visibility: "public" });
    if (!circle || !await CircleMembership.exists({ circle: circle._id, user: user._id })) throw Error("Use a joined disposable Circle member");
    const postMarker = `${marker}:${user._id}`;
    for (let index = 1; index <= 32; index++) {
      const id = stableId(`${user._id}:${slug}:post:${index}`);
      const existing = await Tweet.collection.findOne({ _id: id });
      if (existing && existing.seedTag !== postMarker) throw Error("Seed post ID collision; existing record preserved");
      await Tweet.collection.updateOne({ _id: id, seedTag: postMarker }, { $setOnInsert: { author: user._id, content: `[CIRCLES ACCEPTANCE ${String(index).padStart(2, "0")}] ${circle.name} pagination`, circle: circle._id, topics: [], parentId: null, deletedAt: null, likes: 0, retweets: 0, comments: 0, likedBy: [], retweetedBy: [], image: null, audio: null, timestamp: new Date(Date.now() - index * 1000), seedTag: postMarker } }, { upsert: true });
    }
    console.log(`32 identifiable Circle-feed pagination posts ready for @${username}.`);
  } else if (action === "pagination-cleanup") {
    const postMarker = `${marker}:${user._id}`;
    const posts = await Tweet.collection.find({ seedTag: postMarker, author: user._id }).project({ _id: 1 }).toArray();
    const ids = posts.map(post => post._id);
    if (ids.length && await Tweet.exists({ parentId: { $in: ids } })) throw Error("Replies exist; do not physically remove their parents");
    const removed = await Tweet.collection.deleteMany({ _id: { $in: ids }, seedTag: postMarker, author: user._id });
    console.log(`Removed ${removed.deletedCount} marked disposable pagination posts.`);
  } else {
    const circles = await Circle.collection.find({ seedTag: marker }).project({ _id: 1 }).toArray();
    for (const { _id } of circles) {
      if (await Tweet.exists({ circle: _id })) throw Error("Circle posts remain; remove only disposable posts manually before cleanup");
      if (await CircleMembership.collection.countDocuments({ circle: _id, seedTag: { $ne: marker } })) throw Error("A real acceptance membership remains; leave it before cleanup");
    }
    const ids = circles.map(circle => circle._id);
    await CircleMembership.collection.deleteMany({ circle: { $in: ids }, seedTag: marker });
    const removed = await Circle.collection.deleteMany({ _id: { $in: ids }, seedTag: marker });
    console.log(`Removed ${removed.deletedCount} marked seed Circles and owner memberships.`);
  }
} finally { await mongoose.disconnect(); }
