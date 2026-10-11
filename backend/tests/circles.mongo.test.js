import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Circle from "../models/circle.js";
import CircleMembership from "../models/circleMembership.js";
import Topic from "../models/topic.js";
import Tweet from "../models/tweet.js";
import User from "../models/user.js";
import LoginSession from "../models/loginSession.js";
import Notification from "../models/notification.js";
import { sessionId } from "../security.js";
import { createCircle } from "../circle-operations.js";

const URI = "mongodb://127.0.0.1:27017/twiller_circles_test?replicaSet=phase1";
const uri = process.env.TWILLER_CIRCLES_TEST_MONGODB_URI;
if (uri && uri !== URI) throw Error("Circle integration tests require the fixed disposable loopback database");
const integration = (name, action) => test(name, { skip: !uri && "Set TWILLER_CIRCLES_TEST_MONGODB_URI for isolated MongoDB tests" }, action);
let server, base, owner, member, other, topic, circle;
before(async () => {
  if (!uri) return;
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.equal(mongoose.connection.name, "twiller_circles_test"); assert.equal(hello.setName, "phase1"); assert.equal(hello.isWritablePrimary, true);
  await mongoose.connection.dropDatabase();
  for (const model of [Circle, CircleMembership, Topic, Tweet, User, LoginSession, Notification]) { await model.createCollection(); await model.createIndexes(); }
  const users = await User.create([
    { username: "circles_owner", email: "circles-owner@example.test", firebaseUid: "circles-owner", displayName: "Owner", plan: "gold", planExpiresAt: new Date(Date.now() + 86400000) },
    { username: "circles_member", email: "circles-member@example.test", firebaseUid: "circles-member", displayName: "Member", plan: "gold", planExpiresAt: new Date(Date.now() + 86400000) },
    { username: "circles_other", email: "circles-other@example.test", firebaseUid: "circles-other", displayName: "Other", plan: "gold", planExpiresAt: new Date(Date.now() + 86400000) },
  ]); [owner, member, other] = users;
  topic = await Topic.create({ slug: "ai-ml", name: "AI & ML", description: "Building AI" });
  process.env.NODE_ENV = "test"; process.env.TWILLER_LOCAL_AUTH_EMULATOR = "true"; process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"; process.env.FIREBASE_PROJECT_ID = "demo-twiller-local";
  const { app, securityDependencies } = await import("../index.js");
  const identities = {};
  for (const user of users) { const token = { uid: user.firebaseUid, email: user.email, auth_time: 100, email_verified: true }; identities[token.uid] = token;
    await LoginSession.create({ _id: sessionId(token), uid: token.uid, status: "verified", expiresAt: new Date(Date.now() + 600000) }); }
  securityDependencies.verifyToken = async value => { if (!identities[value]) throw Error("invalid"); return identities[value]; };
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (!uri) return; if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } if (mongoose.connection.readyState === 1 && mongoose.connection.name === "twiller_circles_test") await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
async function request(path, method = "GET", body, identity = "circles-owner") {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(identity ? { Authorization: `Bearer ${identity}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
integration("Circle creation derives owner, persists owner membership and rejects duplicate slug/forgery", async () => {
  assert.equal((await request("/circles", "POST", { name: "AI Builders", description: "Build together", owner: String(other._id) })).status, 400);
  const made = await request("/circles", "POST", { name: "AI Builders", description: "Build together", relatedTopicIds: [String(topic._id)] });
  assert.equal(made.status, 201); assert.equal(made.data.owner.username, owner.username); assert.equal(made.data.membershipRole, "owner"); assert.equal(made.data.memberCount, 1);
  circle = await Circle.findOne({ slug: "ai-builders" });
  assert.equal(String(circle.owner), String(owner._id)); assert.equal(await CircleMembership.countDocuments({ circle: circle._id, user: owner._id, role: "owner" }), 1);
  assert.equal((await request("/circles", "POST", { name: "AI Builders", description: "Again" })).status, 409);
  assert.equal((await request("/circles", "POST", { name: "Other Circle", description: "Build together", relatedTopicIds: [String(new mongoose.Types.ObjectId())] })).status, 400);
  assert.equal(await Circle.countDocuments(), 1);
});
integration("Join and leave are retry-safe, principal-owned; owner cannot leave; public reads are safe", async () => {
  assert.equal((await request(`/circles/${circle._id}/membership`, "PUT", undefined, null)).status, 401);
  assert.equal((await request(`/circles/${circle._id}/membership`, "PUT", { user: String(owner._id) }, "circles-other")).status, 400);
  await Promise.all(Array.from({ length: 4 }, () => request(`/circles/${circle._id}/membership`, "PUT", undefined, "circles-member")));
  assert.equal(await CircleMembership.countDocuments({ circle: circle._id, user: member._id }), 1);
  assert.equal((await request(`/circles/${circle._id}/membership`, "DELETE")).status, 403);
  const publicDetail = await request("/circles/ai-builders", "GET", undefined, null);
  assert.equal(publicDetail.status, 200); assert.equal(publicDetail.data.memberCount, 2); assert.equal(publicDetail.data.relatedTopics[0].slug, "ai-ml");
  assert.doesNotMatch(JSON.stringify(publicDetail.data), /"(?:email|firebaseUid|seedTag|__v)"\s*:/);
  assert.equal((await request("/me/circles", "GET", undefined, "circles-member")).data.circles[0].slug, "ai-builders");
  assert.equal((await request("/me/circles", "GET", undefined, "circles-other")).data.circles.length, 0);
});
integration("Circle posting enforces membership before quota; public and tagged posts stay canonical", async () => {
  const payload = { content: "From Circle", circleId: String(circle._id), topicIds: [String(topic._id)] };
  assert.equal((await request("/post", "POST", payload, "circles-other")).status, 403);
  assert.equal((await User.findById(other._id)).tweetCount, 0);
  assert.equal((await request("/post", "POST", { ...payload, circleId: String(new mongoose.Types.ObjectId()) }, "circles-member")).status, 400);
  const made = await request("/post", "POST", payload, "circles-member"); assert.equal(made.status, 201);
  assert.equal(made.data.circle.slug, "ai-builders"); assert.equal(made.data.topics[0].slug, "ai-ml");
  assert.equal((await request(`/post/${made.data._id}`, "GET", undefined, null)).data.circle.slug, "ai-builders");
  assert.equal((await request("/post", "POST", { content: "Owner post", circleId: String(circle._id) }, "circles-owner")).status, 201);
  assert.equal((await request("/post", "POST", { content: "Global post" }, "circles-member")).data.circle, null);
  assert.equal((await request(`/post/${made.data._id}/reply`, "POST", { content: "Reply" }, "circles-owner")).data.circle, null);
  const leave = await request(`/circles/${circle._id}/membership`, "DELETE", undefined, "circles-member"); assert.equal(leave.status, 200);
  assert.equal((await request(`/circles/${circle._id}/membership`, "DELETE", undefined, "circles-member")).data.membershipRole, null);
  assert.equal((await request("/post", "POST", payload, "circles-member")).status, 403);
  assert.equal((await request("/circles/ai-builders/feed", "GET", undefined, null)).data.tweets.some(post => post._id === made.data._id), true);
  await request(`/circles/${circle._id}/membership`, "PUT", undefined, "circles-member");
});
integration("Circle feed and member cursors are stable, deduplicated and publicly projected", async () => {
  const stamp = new Date("2026-01-01T00:00:00Z");
  await Tweet.insertMany(Array.from({ length: 25 }, (_, index) => ({ _id: new mongoose.Types.ObjectId((200 + index).toString(16).padStart(24, "0")), author: member._id, content: `circle-page-${index}`, circle: circle._id, timestamp: stamp })));
  const first = await request("/circles/ai-builders/feed?limit=20", "GET", undefined, null);
  const second = await request(`/circles/ai-builders/feed?limit=20&cursor=${first.data.nextCursor}`, "GET", undefined, null);
  const all = [...first.data.tweets, ...second.data.tweets]; assert.equal(first.data.tweets.length, 20); assert.equal(new Set(all.map(post => post._id)).size, all.length);
  assert.equal(all.filter(post => post.content.startsWith("circle-page-")).length, 25);
  assert.doesNotMatch(JSON.stringify(all), /"(?:email|firebaseUid|seedTag|__v)"\s*:/);
  const members = await request("/circles/ai-builders/members?limit=1", "GET", undefined, null);
  const rest = await request(`/circles/ai-builders/members?limit=1&cursor=${members.data.nextCursor}`, "GET", undefined, null);
  assert.equal(new Set([...members.data.members, ...rest.data.members].map(row => row.user._id)).size, 2);
  assert.doesNotMatch(JSON.stringify([...members.data.members, ...rest.data.members]), /"(?:email|firebaseUid|__v)"\s*:/);
});
integration("Disabled Circles reject writes and public detail; owner membership creation rolls back on failure", async () => {
  const original = CircleMembership.create;
  CircleMembership.create = async () => { throw Error("injected owner-membership failure"); };
  try {
    await assert.rejects(createCircle(owner._id, { name: "Atomic Test", description: "Transaction rollback" }), /injected owner-membership failure/);
  } finally { CircleMembership.create = original; }
  assert.equal(await Circle.countDocuments({ slug: "atomic-test" }), 0);
  await Circle.updateOne({ _id: circle._id }, { $set: { status: "disabled" } });
  assert.equal((await request("/circles/ai-builders", "GET", undefined, null)).status, 404);
  assert.equal((await request("/post", "POST", { content: "Blocked", circleId: String(circle._id) })).status, 400);
  assert.equal((await request(`/circles/${circle._id}/membership`, "PUT", undefined, "circles-other")).status, 404);
});
