import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Topic from "../models/topic.js";
import TopicFollow from "../models/topicFollow.js";
import Tweet from "../models/tweet.js";
import User from "../models/user.js";
import LoginSession from "../models/loginSession.js";
import Notification from "../models/notification.js";
import { sessionId } from "../security.js";
import { createPost, deletePost } from "../post-operations.js";
import { setTopicFollow } from "../topic-operations.js";

const uri = process.env.TWILLER_TOPICS_TEST_MONGODB_URI;
if (uri && uri !== "mongodb://127.0.0.1:27017/twiller_topics_test?replicaSet=phase1") throw Error("Topics integration tests require the fixed disposable loopback database");
const integration = (name, action) => test(name, { skip: !uri && "Set TWILLER_TOPICS_TEST_MONGODB_URI for isolated MongoDB tests" }, action);
let server, base, owner, other, topic, disabled;
before(async () => {
  if (!uri) return;
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.equal(hello.setName, "phase1"); assert.equal(hello.isWritablePrimary, true);
  await mongoose.connection.dropDatabase();
  for (const model of [Topic, TopicFollow, Tweet, User, LoginSession, Notification]) { await model.createCollection(); await model.createIndexes(); }
  owner = await User.create({ username: "topics_owner", email: "owner@example.test", firebaseUid: "topics-owner", displayName: "Owner", plan: "gold", planExpiresAt: new Date(Date.now() + 86400000) });
  other = await User.create({ username: "topics_other", email: "other@example.test", firebaseUid: "topics-other", displayName: "Other", plan: "gold", planExpiresAt: new Date(Date.now() + 86400000) });
  topic = await Topic.create({ slug: "react", name: "React", description: "Development" });
  disabled = await Topic.create({ slug: "disabled", name: "Disabled", status: "disabled" });
  process.env.NODE_ENV = "test"; process.env.TWILLER_LOCAL_AUTH_EMULATOR = "true"; process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"; process.env.FIREBASE_PROJECT_ID = "demo-twiller-local";
  const { app, securityDependencies } = await import("../index.js");
  const identities = {};
  for (const user of [owner, other]) {
    const token = { uid: user.firebaseUid, email: user.email, auth_time: 100, email_verified: true }; identities[token.uid] = token;
    await LoginSession.create({ _id: sessionId(token), uid: token.uid, status: "verified", expiresAt: new Date(Date.now() + 600000) });
  }
  securityDependencies.verifyToken = async value => { if (!identities[value]) throw Error("invalid"); return identities[value]; };
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (!uri) return; if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
async function request(path, method = "GET", body, credential = "topics-owner") {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
integration("Topic slug and user/topic pair uniqueness under concurrent retries, private followed lists", async () => {
  await assert.rejects(Topic.create({ slug: "react", name: "Duplicate" }), error => error.code === 11000);
  await Promise.all(Array.from({ length: 5 }, () => setTopicFollow(owner._id, topic._id, true)));
  assert.equal(await TopicFollow.countDocuments({ user: owner._id, topic: topic._id }), 1);
  assert.equal((await request("/me/topics")).data.topics[0].slug, "react");
  assert.equal((await request("/me/topics", "GET", undefined, "topics-other")).data.topics.length, 0);
  assert.equal((await request(`/topics/${topic._id}/follow`, "DELETE", { userId: String(owner._id) }, "topics-other")).status, 400);
  assert.equal(await TopicFollow.countDocuments({ user: owner._id, topic: topic._id }), 1);
  await setTopicFollow(owner._id, topic._id, false); await setTopicFollow(owner._id, topic._id, false);
  assert.equal(await TopicFollow.countDocuments({ user: owner._id, topic: topic._id }), 0);
});
integration("Topic assignment validates before quota; canonical reads/reactions retain safe topics; replies stay untagged", async () => {
  for (const topicIds of [[String(disabled._id)], [String(new mongoose.Types.ObjectId())], [String(topic._id), String(topic._id)], ["bad"], Array(4).fill(String(topic._id))]) {
    assert.equal((await request("/post", "POST", { content: "Invalid", topicIds })).status, 400);
  }
  assert.equal((await User.findById(owner._id)).tweetCount, 0);
  const response = await request("/post", "POST", { content: "Tagged", topicIds: [String(topic._id)] });
  assert.equal(response.status, 201); assert.equal(response.data.topics[0].slug, "react");
  assert.doesNotMatch(JSON.stringify(response.data), /"(?:seedTag|email|firebaseUid|__v)"\s*:/);
  const untagged = await request("/post", "POST", { content: "Untagged" }); assert.equal(untagged.status, 201); assert.deepEqual(untagged.data.topics, []);
  const reply = await request(`/post/${response.data._id}/reply`, "POST", { content: "Reply" }); assert.equal(reply.status, 201); assert.deepEqual(reply.data.topics, []);
  const reaction = await request(`/like/${response.data._id}`, "POST", {}); assert.equal(reaction.data.topics[0].slug, "react");
  const hydrated = await request(`/post/${response.data._id}`, "GET", undefined, null); assert.equal(hydrated.data.topics[0].name, "React");
  assert.equal((await request(`/post/${response.data._id}/reply`, "POST", { content: "Reply", topicIds: [String(topic._id)] })).status, 400);
});
integration("Topic feeds page in stable order with tied dates, safe authors/media/counts, and deleted parent exclusion", async () => {
  const timestamp = new Date("2026-01-01T00:00:00Z");
  await Tweet.insertMany(Array.from({ length: 24 }, (_, index) => ({ _id: new mongoose.Types.ObjectId((100 + index).toString(16).padStart(24, "0")), author: other._id, content: `pagination-${index}`, topics: [topic._id], timestamp, image: "http://127.0.0.1:5055/media/test", comments: 2, retweets: 3 })));
  const first = await request("/topics/react/feed?limit=20", "GET", undefined, null); assert.equal(first.data.tweets.length, 20); assert.equal(first.data.hasMore, true);
  const second = await request(`/topics/react/feed?limit=20&cursor=${first.data.nextCursor}`, "GET", undefined, null);
  const all = [...first.data.tweets, ...second.data.tweets]; assert.equal(new Set(all.map(post => post._id)).size, all.length);
  const seeded = all.filter(post => post.content.startsWith("pagination-")); assert.equal(seeded.length, 24);
  assert.deepEqual(seeded.map(post => post.content), Array.from({ length: 24 }, (_, index) => `pagination-${23 - index}`));
  assert.equal(seeded[0].image, "http://127.0.0.1:5055/media/test"); assert.equal(seeded[0].comments, 2); assert.equal(seeded[0].retweets, 3);
  assert.doesNotMatch(JSON.stringify(all), /"(?:email|firebaseUid|__v)"\s*:/);
  const parent = await createPost(other._id, { content: "Delete me", topicIds: [String(topic._id)] });
  await createPost(owner._id, { content: "Retain reply" }, parent._id);
  await deletePost(other._id, parent._id);
  assert.ok((await Tweet.findById(parent._id)).deletedAt);
  const afterDelete = await request("/topics/react/feed?limit=50", "GET", undefined, null); assert.equal(afterDelete.data.tweets.some(post => post._id === String(parent._id)), false);
  await Topic.updateOne({ _id: topic._id }, { $set: { status: "disabled" } });
  assert.equal((await request("/topics/react/feed", "GET", undefined, null)).status, 404);
});
