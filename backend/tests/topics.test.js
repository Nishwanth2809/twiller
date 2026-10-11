import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Topic, { topicView } from "../models/topic.js";
import TopicFollow from "../models/topicFollow.js";
import Tweet from "../models/tweet.js";
import User from "../models/user.js";
import { boundary, errorHandler, validateRequest, validTopicIds } from "../security.js";
import { registerTopicRoutes } from "../topic-operations.js";
import { createPost } from "../post-operations.js";
import { encodeCursor } from "../pagination.js";
import express from "express";
const a = "111111111111111111111111", b = "222222222222222222222222", id = "333333333333333333333333";

test("Topics boundary rejects claimed owners, malformed IDs/slugs, oversized limits, bad cursors and unsupported fields before lookup", () => {
  for (const req of [{ params: { id }, body: { userId: b } }, { params: { id: "bad" } }, { params: { id }, body: { owner: a } }]) assert.throws(() => validateRequest("PUT /topics/:id/follow", req), error => error.status === 400);
  for (const query of [{ limit: 51 }, { q: "x".repeat(81) }, { cursor: "bad" }, { status: "disabled" }]) assert.throws(() => validateRequest("GET /topics", { query }), error => error.status === 400);
  assert.throws(() => validateRequest("GET /topics/:slug", { params: { slug: "AI ML" } }), error => error.status === 400);
  for (const topics of [[id, id], [a, b, id, "444444444444444444444444"], ["bad"], {}, null]) assert.equal(validTopicIds(topics), false);
  assert.equal(validTopicIds([]), true); assert.equal(validTopicIds([id]), true);
  assert.throws(() => validateRequest("POST /post/:id/reply", { params: { id }, body: { content: "Reply", topicIds: [id] } }), error => error.status === 400);
});
test("Topics models enforce bounded fields, normalized slug/status and schema-defined uniqueness", async () => {
  await new Topic({ slug: "ai-ml", name: "AI & ML" }).validate();
  for (const value of [{ slug: "AI ML", name: "AI" }, { slug: "react", name: "" }, { slug: "react", name: "React", status: "other" }]) await assert.rejects(new Topic(value).validate());
  assert.ok(Topic.schema.indexes().some(([keys, options]) => keys.slug === 1 && options.unique));
  assert.ok(TopicFollow.schema.indexes().some(([keys, options]) => keys.user === 1 && keys.topic === 1 && options.unique));
  await assert.rejects(new Tweet({ author: a, content: "post", topics: [id, id] }).validate());
  assert.deepEqual(topicView({ _id: id, slug: "react", name: "React", seedTag: "private", __v: 9 }), { _id: id, slug: "react", name: "React" });
  const doc = new Tweet({ author: a, content: "old untagged post" });
  assert.deepEqual(doc.toJSON().topics, []);
});
test("Malformed or reply topic assignments fail before quota/database operations", async () => {
  await assert.rejects(createPost(a, { content: "Post", topicIds: ["invalid"] }), error => error.status === 400);
  await assert.rejects(createPost(a, { content: "Reply", topicIds: [id] }, b), error => error.status === 400);
});

let server, base;
const saved = [];
function substitute(model, name, value) { saved.push([model, name, model[name]]); model[name] = value; }
const follows = new Map();
const topics = Array.from({ length: 4 }, (_, i) => ({ _id: new mongoose.Types.ObjectId(String(i + 3).padStart(24, "0")), slug: `topic-${i}`, name: `Topic ${i}`, description: "", status: i === 3 ? "disabled" : "active", createdAt: new Date(10000 - i * 1000) }));
let findCalls = 0;
function matching(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some(branch => matching(row, branch));
    if (value instanceof RegExp) return value.test(row[key]);
    if (value && typeof value === "object" && !(value instanceof mongoose.Types.ObjectId) && !(value instanceof Date)) {
      if (value.$in) return value.$in.some(item => String(item) === String(row[key]));
      if (value.$lt !== undefined) return row[key] < value.$lt;
      return false;
    }
    return String(row[key]) === String(value);
  });
}
function query(rows) {
  const q = { select() { return q; }, lean() { return q; }, maxTimeMS() { return q; }, sort() { rows.sort((x, y) => Number(y.createdAt || y.timestamp) - Number(x.createdAt || x.timestamp) || String(y._id).localeCompare(String(x._id))); return q; }, limit(n) { rows = rows.slice(0, n); return q; }, populate() { return q; }, then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); } };
  return q;
}
async function request(path, method = "GET", body, credential) {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  substitute(Topic, "find", filter => { findCalls++; return query(topics.filter(row => matching(row, filter))); });
  substitute(Topic, "findOne", filter => { const row = topics.find(row => matching(row, filter)); return { select: async () => row }; });
  substitute(Topic, "exists", async filter => topics.some(row => matching(row, filter)));
  substitute(TopicFollow, "find", filter => query([...follows.values()].filter(row => matching(row, filter))));
  substitute(TopicFollow, "updateOne", async (filter, update) => { const key = `${filter.user}:${filter.topic}`; if (!follows.has(key)) follows.set(key, { ...filter, createdAt: update.$setOnInsert.createdAt }); });
  substitute(TopicFollow, "deleteOne", async filter => follows.delete(`${filter.user}:${filter.topic}`));
  const dependencies = {
    verifyToken: async value => { if (!['a', 'b'].includes(value)) throw Error("expired"); return { uid: value, email: `${value}@example.test`, auth_time: 100 }; },
    User: { findOne: async filter => ({ _id: filter.firebaseUid === 'a' ? a : b }) },
    LoginSession: { findById: async key => ({ _id: key, status: "verified", expiresAt: new Date(Date.now() + 60000) }) },
  };
  const app = express(); app.use(express.json()); registerTopicRoutes(app, key => boundary(key, dependencies)); app.use(errorHandler);
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { for (const [model, name, original] of saved) model[name] = original; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
test("Anonymous public topic discovery/detail and stable cursor pagination; invalid token is not treated as anonymous", async () => {
  const first = await request("/topics?limit=2"); assert.equal(first.status, 200); assert.equal(first.data.topics.length, 2); assert.equal(first.data.hasMore, true);
  const second = await request(`/topics?limit=2&cursor=${first.data.nextCursor}`); assert.equal(second.data.topics.length, 1);
  assert.equal(new Set([...first.data.topics, ...second.data.topics].map(topic => topic._id)).size, 3);
  assert.equal((await request("/topics/topic-0")).status, 200);
  assert.equal((await request("/topics/topic-3")).status, 404);
  assert.equal((await request("/topics/topic-absent")).status, 404);
  assert.equal((await request("/topics", "GET", undefined, "expired")).status, 401);
  const before = findCalls; assert.equal((await request("/topics?limit=999")).status, 400); assert.equal(findCalls, before);
});
test("Topic follow/unfollow retries preserve owner isolation and reject arbitrary supplied identities", async () => {
  const topicId = String(topics[0]._id), path = `/topics/${topicId}/follow`;
  assert.equal((await request(path, "PUT")).status, 401);
  assert.equal((await request(path, "PUT", { userId: b }, "a")).status, 400);
  assert.equal((await request(path, "PUT", undefined, "a")).data.following, true);
  await request(path, "PUT", undefined, "a"); assert.equal(follows.size, 1);
  assert.equal((await request("/topics/topic-0", "GET", undefined, "b")).data.following, false);
  assert.equal((await request("/topics/topic-0", "GET", undefined, "a")).data.following, true);
  await request(path, "DELETE", undefined, "b"); assert.equal(follows.size, 1);
  await request(path, "DELETE", undefined, "a"); await request(path, "DELETE", undefined, "a"); assert.equal(follows.size, 0);
  assert.equal((await request(`/topics/${topics[3]._id}/follow`, "PUT", undefined, "a")).status, 404);
  assert.equal((await request(`/topics/${id}/follow`, "PUT", undefined, "a")).status, 404);
  assert.equal((await request("/me/topics")).status, 401);
});
test("Topic feed uses existing cursor ordering and excludes replies/deleted posts", async () => {
  const topic = topics[0];
  const posts = Array.from({ length: 5 }, (_, i) => ({ _id: new mongoose.Types.ObjectId(String(20 + i).padStart(24, "0")), topics: topic._id, content: String(i), parentId: i === 3 ? id : null, deletedAt: i === 4 ? new Date() : null, timestamp: new Date(10000 - i * 1000) }));
  const old = Tweet.find;
  try {
    Tweet.find = filter => query(posts.filter(row => matching(row, filter)));
    const first = await request("/topics/topic-0/feed?limit=2"); assert.equal(first.status, 200); assert.deepEqual(first.data.tweets.map(row => row.content), ["0", "1"]);
    assert.equal(first.data.nextCursor, encodeCursor(posts[1]));
    const next = await request(`/topics/topic-0/feed?limit=2&cursor=${first.data.nextCursor}`); assert.deepEqual(next.data.tweets.map(row => row.content), ["2"]); assert.equal(next.data.hasMore, false);
  } finally { Tweet.find = old; }
});
test("Post assignment checks active topic membership before quota and retains untagged compatibility", async () => {
  const originals = { startSession: mongoose.startSession, count: Topic.countDocuments, user: User.findById, update: User.updateOne, create: Tweet.create };
  const session = {}, writes = []; let activeCount = 0;
  try {
    mongoose.startSession = async () => ({ withTransaction: async action => action(), endSession: async () => {} });
    Topic.countDocuments = filter => ({ session: async () => { assert.deepEqual(filter, { _id: { $in: [id] }, status: "active" }); return activeCount; } });
    User.findById = () => ({ session: async () => ({ _id: a, plan: "gold", planExpiresAt: new Date(Date.now() + 86400000), tweetCount: 0 }) });
    User.updateOne = async () => { writes.push("quota"); };
    Tweet.create = async ([post]) => { writes.push(post); return [{ ...post, populate: async fields => { assert.equal(fields[1].path, "topics"); return post; } }]; };
    await assert.rejects(createPost(a, { content: "Tagged", topicIds: [id] }), error => error.status === 400);
    assert.equal(writes.length, 0);
    activeCount = 1;
    const tagged = await createPost(a, { content: "Tagged", topicIds: [id] }); assert.deepEqual(tagged.topics, [id]); assert.equal(String(tagged.author), a);
    const untagged = await createPost(a, { content: "Untagged" }); assert.deepEqual(untagged.topics, []);
    assert.equal(writes.filter(value => value === "quota").length, 2);
    void session;
  } finally { mongoose.startSession = originals.startSession; Topic.countDocuments = originals.count; User.findById = originals.user; User.updateOne = originals.update; Tweet.create = originals.create; }
});
