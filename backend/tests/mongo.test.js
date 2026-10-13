import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import User from "../models/user.js";
import Tweet from "../models/tweet.js";
import Subscription from "../models/subscription.js";
import LoginSession from "../models/loginSession.js";
import Conversation from "../models/conversation.js";
import Message from "../models/message.js";
import Notification from "../models/notification.js";
import { sessionId } from "../security.js";
import { verifyPurchase } from "../payment.js";
import { createPost, deletePost, follow } from "../post-operations.js";
import { toggleReaction } from "../reactions.js";
import { markRead } from "../notification-operations.js";
import { pairKey } from "../handles.js";
import Media from "../models/media.js";
import sharp from "sharp";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const uri = process.env.PHASE1_TEST_MONGODB_URI;
// Refuse production/remote databases even if a URI is accidentally supplied.
if (uri && !/^mongodb:\/\/127\.0\.0\.1:\d+\/twiller_phase1_test\?replicaSet=phase1$/.test(uri)) throw new Error("Phase 1 integration tests require the isolated loopback test database");
let server, base, owner, other, token, appModule, firebaseVerifier, mediaTestDirectory;
const integration = (name, action) => test(name, { skip: !uri && "Set PHASE1_TEST_MONGODB_URI to the isolated replica set" }, action);
async function request(path, method = "GET", body, credential = "test-owner") {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  if (!uri) return;
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Tweet, Subscription, LoginSession, Conversation, Message, Notification].map(async model => { await model.createCollection(); await model.createIndexes(); }));
  owner = await User.create({ firebaseUid: "test-owner", email: "owner@example.test", username: "owner", displayName: "Owner", loginOtp: "123456", audioOtp: "654321", languageOtp: "012345", loginHistory: [{ ip: "private" }] });
  other = await User.create({ firebaseUid: "test-other", email: "other@example.test", username: "other", displayName: "Other" });
  token = { uid: "test-owner", email: owner.email, auth_time: 100, email_verified: true };
  await LoginSession.create({ _id: sessionId(token), uid: token.uid, status: "verified", expiresAt: new Date(Date.now() + 600000) });
  process.env.NODE_ENV = "test";
  mediaTestDirectory = await mkdtemp(path.join(tmpdir(), "twiller-phase2-media-"));
  process.env.MEDIA_DIR = mediaTestDirectory;
  appModule = await import("../index.js");
  firebaseVerifier = appModule.securityDependencies.verifyToken;
  appModule.securityDependencies.verifyToken = async value => { if (value !== "test-owner") throw new Error("Invalid/expired token"); return token; };
  appModule.mailDependencies.send = async () => {};
  process.env.MONOGDB_URL = uri; process.env.PORT = "0";
  server = await appModule.startServer();
  if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (!uri) return;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  if (mediaTestDirectory) await rm(mediaTestDirectory, { recursive: true, force: true });
});
integration("TW-001/018: backend starts and every protected operation rejects anonymous requests", async () => {
  const id = String(owner._id);
  const routes = [
    ["GET", "/loggedinuser"], ["PATCH", `/userupdate/${owner.email}`, { bio: "hi" }], ["GET", `/user-plan/${owner.email}`],
    ["POST", "/register", { username: "new", displayName: "New" }], ["POST", "/log-session", {}], ["POST", "/verify-login-otp", { otp: "123456" }], ["POST", "/logout", {}],
    ["POST", "/create-order", { plan: "bronze" }], ["POST", "/verify-payment", { razorpay_order_id: "order_test", razorpay_payment_id: "pay_test", razorpay_signature: "0".repeat(64) }],
    ["POST", "/request-language-change", { targetLanguage: "fr" }], ["POST", "/verify-language-change", { targetLanguage: "fr", otp: "123456" }], ["POST", "/generate-audio-otp", {}],
    ["POST", "/post", { content: "post" }], ["DELETE", `/post/${id}`, {}], ["POST", `/like/${id}`, {}], ["POST", `/retweet/${id}`, {}], ["POST", `/post/${id}/reply`, { content: "reply" }],
    ["POST", `/follow/${id}`, {}], ["DELETE", `/follow/${id}`, {}], ["POST", `/bookmark/${id}`, {}], ["GET", `/bookmarks/${id}`],
    ["GET", `/conversations/${id}`], ["POST", "/conversations", { receiverId: id }], ["GET", `/conversations/${id}/messages`], ["POST", `/conversations/${id}/messages`, { content: "message" }], ["PATCH", `/conversations/${id}/read`, {}], ["GET", `/unread-count/${id}`],
    ["GET", `/feed?type=following&userId=${id}`], ["GET", `/suggested-users?userId=${id}`],
  ];
  for (const [method, path, body] of routes) assert.equal((await request(path, method, body, null)).status, 401, `${method} ${path}`);
  assert.equal((await request("/loggedinuser", "GET", undefined, "expired")).status, 401);
  const controlledVerifier = appModule.securityDependencies.verifyToken;
  try {
    appModule.securityDependencies.verifyToken = firebaseVerifier;
    // This exercises the installed Firebase SDK rather than the controlled verifier.
    assert.equal((await request("/loggedinuser", "GET", undefined, "not-a-firebase-jwt")).status, 401);
  } finally { appModule.securityDependencies.verifyToken = controlledVerifier; }
});
integration("TW-001/002/003: real database private/public reads and mutation projections are safe", async () => {
  await assert.rejects(User.create({ firebaseUid: owner.firebaseUid, email: "duplicate@example.test", username: "duplicate", displayName: "Duplicate" }), error => error.code === 11000);
  const post = await Tweet.create({ author: owner._id, content: "public content" });
  owner.bookmarks.push(post._id); await owner.save();
  const publicPaths = ["/post", "/feed", `/post/${post._id}`, `/post/${post._id}/replies`, "/users/owner", "/users/owner/posts", "/search?q=public", "/suggested-users"];
  const forbidden = /"(?:email|loginOtp|audioOtp|languageOtp|firebaseUid|loginHistory|bookmarks|phoneNumber|lastPasswordReset|__v)"\s*:/;
  for (const path of publicPaths) { const response = await request(path, "GET", undefined, null); assert.equal(response.status, 200, path); assert.doesNotMatch(JSON.stringify(response.data), forbidden, path); }
  for (const path of [`/like/${post._id}`, `/retweet/${post._id}`]) { const response = await request(path, "POST", {}); assert.equal(response.data.author.displayName, "Owner"); assert.doesNotMatch(JSON.stringify(response.data), forbidden); }
  const me = await request("/loggedinuser"); assert.equal(me.data.email, owner.email); assert.equal(me.data.loginOtp, undefined); assert.equal(me.data.firebaseUid, undefined);
  const bookmarks = await request(`/bookmarks/${owner._id}`); assert.doesNotMatch(JSON.stringify(bookmarks.data), forbidden);
  for (const body of [{ plan: "gold" }, { followers: [] }, { email: other.email }, { loginOtp: "000000" }, { $set: { plan: "gold" } }]) assert.equal((await request(`/userupdate/${owner.email}`, "PATCH", body)).status, 400);
  assert.equal((await request(`/userupdate/${other.email}`, "PATCH", { bio: "hijack" })).status, 403);
  assert.equal((await request(`/bookmarks/${other._id}`)).status, 403);
  const otherPost = await Tweet.create({ author: other._id, content: "other content" });
  assert.equal((await request(`/post/${otherPost._id}`, "DELETE", {})).status, 403); assert.ok(await Tweet.findById(otherPost._id));
  const conversation = await Conversation.create({ participants: [other._id, new mongoose.Types.ObjectId()] });
  for (const method of ["GET", "POST", "PATCH"]) assert.equal((await request(`/conversations/${conversation._id}/${method === "PATCH" ? "read" : "messages"}`, method, method === "POST" ? { content: "hijack" } : undefined)).status, 403);
  const updated = await request(`/userupdate/${owner.email}`, "PATCH", { bio: "new bio" }); assert.equal(updated.data.bio, "new bio"); assert.equal(updated.data.loginOtp, undefined);
  assert.equal((await User.findById(owner._id)).plan, "free");
});
integration("TW-005: real transactions, concurrent duplicate callbacks, replay and database rollback", async () => {
  const purchase = await Subscription.create({ userId: owner._id, plan: "bronze", razorpayOrderId: "order_real", amount: 10000 });
  const secret = "isolated-test-secret";
  const deps = { Subscription, User, mongoose, secret, plans: { bronze: { price: 10000 } }, razorpay: { payments: { fetch: async () => ({ order_id: "order_real", amount: 10000, currency: "INR", status: "captured" }) }, orders: { fetch: async () => ({ id: "order_real", amount: 10000, currency: "INR", status: "paid" }) } } };
  const input = { razorpay_order_id: "order_real", razorpay_payment_id: "pay_real", razorpay_signature: crypto.createHmac("sha256", secret).update("order_real|pay_real").digest("hex") };
  const results = await Promise.all([verifyPurchase(input, owner, deps), verifyPurchase(input, owner, deps)]);
  assert.deepEqual(results.map(value => value.alreadyProcessed).sort(), [false, true]);
  const first = await User.findById(owner._id);
  await User.updateOne({ _id: owner._id }, { $set: { tweetCount: 2 } });
  assert.equal((await verifyPurchase(input, owner, deps)).alreadyProcessed, true);
  const repeated = await User.findById(owner._id); assert.equal(repeated.tweetCount, 2); assert.equal(+repeated.planExpiresAt, +first.planExpiresAt);
  await assert.rejects(Subscription.create({ userId: owner._id, plan: "bronze", razorpayOrderId: purchase.razorpayOrderId, amount: 10000 }), error => error.code === 11000);
  await assert.rejects(Subscription.create({ userId: owner._id, plan: "bronze", razorpayOrderId: "order_duplicatepayment", razorpayPaymentId: "pay_real", amount: 10000 }), error => error.code === 11000);
  const pending = await Subscription.create({ userId: owner._id, plan: "bronze", razorpayOrderId: "order_rollback", amount: 10000 });
  const rollbackInput = { razorpay_order_id: "order_rollback", razorpay_payment_id: "pay_rollback", razorpay_signature: crypto.createHmac("sha256", secret).update("order_rollback|pay_rollback").digest("hex") };
  const failing = { ...deps, User: { findOneAndUpdate: async () => { throw new Error("isolated write failure"); } }, razorpay: { payments: { fetch: async () => ({ order_id: "order_rollback", amount: 10000, currency: "INR", status: "captured" }) }, orders: { fetch: async () => ({ id: "order_rollback", amount: 10000, currency: "INR", status: "paid" }) } } };
  await assert.rejects(verifyPurchase(rollbackInput, owner, failing), /isolated write failure/);
  assert.equal((await Subscription.findById(pending._id)).status, "created"); assert.equal((await User.findById(owner._id)).tweetCount, 2);
});

integration("TW-010/TW-016: concurrent post and reply creation cannot overspend quota or split relationship counts", async () => {
  const quotaOwner = await User.create({ firebaseUid: "quota-owner", email: "quota@example.test", username: "quotaowner", displayName: "Quota", plan: "free", tweetCount: 0 });
  const results = await Promise.allSettled([
    createPost(quotaOwner._id, { content: "one" }),
    createPost(quotaOwner._id, { content: "two" }),
  ]);
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(results.filter(item => item.status === "rejected").length, 1);
  let refreshed = await User.findById(quotaOwner._id);
  assert.equal(refreshed.tweetCount, 1);
  await User.updateOne({ _id: quotaOwner._id }, { $set: { plan: "bronze", planActivatedAt: new Date(), planExpiresAt: new Date(Date.now() + 30 * 86400000) } });
  const parent = await Tweet.create({ author: owner._id, content: "parent" });
  const reply = await createPost(quotaOwner._id, { content: "reply" }, parent._id);
  assert.equal(String(reply.parentId), String(parent._id));
  assert.equal((await Tweet.findById(parent._id)).comments, 1);
  assert.equal((await User.findById(quotaOwner._id)).tweetCount, 2);
});

integration("TW-013/TW-041: latest message window paginates older records without overlap and keeps deterministic order", async () => {
  const conversation = await Conversation.create({ pairKey: pairKey([owner._id, other._id]), participants: [owner._id, other._id] });
  const rows = Array.from({ length: 63 }, (_, index) => ({ conversationId: conversation._id, sender: index % 2 ? owner._id : other._id, content: `message-${index}`, createdAt: new Date(Date.now() - (63 - index) * 1000) }));
  await Message.insertMany(rows);
  const first = await request(`/conversations/${conversation._id}/messages?limit=50`);
  assert.equal(first.status, 200); assert.equal(first.data.messages.length, 50); assert.equal(first.data.hasMore, true);
  assert.equal(first.data.messages[0].content, "message-13"); assert.equal(first.data.messages.at(-1).content, "message-62");
  const second = await request(`/conversations/${conversation._id}/messages?limit=50&cursor=${encodeURIComponent(first.data.nextCursor)}`);
  assert.equal(second.status, 200); assert.equal(second.data.messages.length, 13); assert.equal(second.data.hasMore, false);
  const all = [...second.data.messages, ...first.data.messages];
  assert.equal(new Set(all.map(message => message._id)).size, 63);
  assert.deepEqual(all.map(message => message.content), rows.map(message => message.content));
  assert.equal((await request(`/conversations/${conversation._id}/messages?limit=50`, "GET", undefined, null)).status, 401);
});

integration("TW-016/TW-033: follow/unfollow symmetry, tombstone child preservation, parent count and bookmark cleanup", async () => {
  const parent = await Tweet.create({ author: owner._id, content: "parent" });
  const child = await Tweet.create({ author: other._id, content: "child", parentId: parent._id });
  const media = await Media.create({ owner: owner._id, kind: "image", mime: "image/jpeg", bytes: 10, filename: `${new mongoose.Types.ObjectId()}.jpg`, published: true });
  const mediaUrl = `${process.env.MEDIA_PUBLIC_BASE_URL || "http://localhost:5000"}/media/${media._id}`;
  await Tweet.updateOne({ _id: parent._id }, { $set: { image: mediaUrl } });
  const secondReference = await Tweet.create({ author: owner._id, content: "same media", image: mediaUrl });
  await Tweet.updateOne({ _id: parent._id }, { $inc: { comments: 1 } });
  await User.updateOne({ _id: owner._id }, { $addToSet: { bookmarks: parent._id } });
  await deletePost(owner._id, parent._id);
  const tombstone = await Tweet.findById(parent._id);
  assert.ok(tombstone.deletedAt); assert.equal(tombstone.content, ""); assert.ok(await Tweet.exists({ _id: child._id }));
  assert.equal((await Media.findById(media._id)).published, true);
  assert.equal((await User.findById(owner._id)).bookmarks.some(id => String(id) === String(parent._id)), false);
  await deletePost(other._id, child._id);
  await deletePost(owner._id, secondReference._id);
  assert.equal((await Media.findById(media._id)).published, false);
  assert.equal((await Tweet.findById(parent._id)).comments, 0);
  await follow(owner._id, other._id); assert.ok((await User.findById(owner._id)).following.some(id => String(id) === String(other._id)));
  await follow(owner._id, other._id);
  assert.equal(await Notification.countDocuments({ recipient: other._id, actor: owner._id, type: "follow" }), 1);
  await follow(owner._id, other._id, true); assert.equal((await User.findById(other._id)).followers.some(id => String(id) === String(owner._id)), false);
});

integration("TW-020: reply, mention, like notifications are owner-scoped and read state is persisted", async () => {
  const parent = await Tweet.create({ author: owner._id, content: "notification parent" });
  const reply = await createPost(other._id, { content: `A reply for @${owner.username}` }, parent._id);
  assert.equal(await Notification.countDocuments({ recipient: owner._id, actor: other._id, type: "reply", post: reply._id }), 1);
  assert.equal(await Notification.countDocuments({ recipient: owner._id, actor: other._id, type: "mention", post: reply._id }), 1);

  const post = await Tweet.create({ author: owner._id, content: "like notification" });
  await toggleReaction(post._id, other._id, "like");
  const like = await Notification.findOne({ recipient: owner._id, actor: other._id, type: "like", post: post._id });
  assert.ok(like);
  assert.ok(await markRead(owner._id, like._id));
  assert.ok((await Notification.findById(like._id)).readAt);
  await assert.rejects(markRead(other._id, like._id), /Notification not found/);
  assert.equal((await request("/notifications")).status, 200);
});

integration("TW-028: bookmark add, remove and clear are idempotent and owner-scoped", async () => {
  const first = await Tweet.create({ author: owner._id, content: "bookmark one" });
  const second = await Tweet.create({ author: owner._id, content: "bookmark two" });
  assert.equal((await request(`/bookmarks/${first._id}`, "PUT")).status, 200);
  assert.equal((await request(`/bookmarks/${first._id}`, "PUT")).status, 200);
  assert.equal((await User.findById(owner._id)).bookmarks.filter(id => String(id) === String(first._id)).length, 1);
  assert.equal((await request(`/bookmarks/${first._id}`, "DELETE")).status, 200);
  assert.equal((await request(`/bookmarks/${first._id}`, "DELETE")).status, 200);
  assert.equal((await User.findById(owner._id)).bookmarks.some(id => String(id) === String(first._id)), false);
  await request(`/bookmarks/${first._id}`, "PUT"); await request(`/bookmarks/${second._id}`, "PUT");
  assert.equal((await request("/bookmarks", "DELETE")).status, 200);
  assert.equal((await request("/bookmarks", "DELETE")).status, 200);
  assert.equal((await User.findById(owner._id)).bookmarks.length, 0);
  assert.equal((await request("/bookmarks/not-an-id", "PUT")).status, 400);
  await request(`/bookmarks/${first._id}`, "PUT");
  const otherToken = { uid: "test-other", email: other.email, auth_time: 100, email_verified: true };
  await LoginSession.create({ _id: sessionId(otherToken), uid: otherToken.uid, status: "verified", expiresAt: new Date(Date.now() + 600000) });
  const previousVerifier = appModule.securityDependencies.verifyToken;
  try {
    appModule.securityDependencies.verifyToken = async value => value === "test-other" ? otherToken : token;
    assert.equal((await request(`/bookmarks/${first._id}`, "DELETE", undefined, "test-other")).status, 200);
    assert.equal((await User.findById(owner._id)).bookmarks.some(id => String(id) === String(first._id)), true);
  } finally { appModule.securityDependencies.verifyToken = previousVerifier; }
});

integration("TW-014/TW-029/TW-037/TW-044: uploads are bounded, owner-bound and persist as profile avatars and post media", async () => {
  // Earlier integration cases consume the shared free-plan allowance. Keep this
  // media-ownership assertion focused on ownership rather than quota ordering.
  await User.updateOne({ _id: other._id }, { $set: { plan: "gold", planExpiresAt: new Date(Date.now() + 86400000) } });
  process.env.MEDIA_PUBLIC_BASE_URL = base;
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer();
  const uploaded = await fetch(`${base}/media-upload?kind=image`, { method: "POST", headers: { Authorization: "Bearer test-owner", "Content-Type": "application/octet-stream" }, body: png });
  assert.equal(uploaded.status, 201);
  const media = await uploaded.json();
  assert.equal(media.mime, "image/jpeg"); assert.equal(media.bytes > 0, true);
  assert.equal(new URL(media.url).origin, base);
  assert.equal((await request(`/media/${media.id}`, "GET", undefined, null)).status, 404);
  await assert.rejects(createPost(other._id, { content: "foreign media", image: media.url }), error => error.code === "MEDIA_FORBIDDEN");
  const profileUpdate = await request(`/userupdate/${owner.email}`, "PATCH", { avatar: media.url });
  assert.equal(profileUpdate.status, 200); assert.equal(profileUpdate.data.avatar, media.url);
  assert.equal((await request("/loggedinuser")).data.avatar, media.url);
  const avatarResponse = await fetch(media.url);
  assert.equal(avatarResponse.status, 200); assert.equal(avatarResponse.headers.get("content-type"), "image/jpeg");
  const post = await createPost(owner._id, { content: "verified media", image: media.url });
  assert.equal(String(post.image), media.url);
  assert.equal((await Media.findById(media.id)).published, true);
  const publicRead = await fetch(media.url);
  assert.equal(publicRead.status, 200); assert.equal(publicRead.headers.get("content-type"), "image/jpeg");
  const invalid = await fetch(`${base}/media-upload?kind=image`, { method: "POST", headers: { Authorization: "Bearer test-owner", "Content-Type": "application/octet-stream" }, body: Buffer.from("not media") });
  assert.equal(invalid.status, 400);
});

integration("Staging media remains readable from MongoDB without a local upload file", async () => {
  const previousStage = process.env.TWILLER_DEPLOYMENT_STAGE;
  process.env.TWILLER_DEPLOYMENT_STAGE = "staging";
  try {
    process.env.MEDIA_PUBLIC_BASE_URL = base;
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "green" } }).png().toBuffer();
    const uploaded = await fetch(`${base}/media-upload?kind=image`, {
      method: "POST",
      headers: { Authorization: "Bearer test-owner", "Content-Type": "application/octet-stream" },
      body: png,
    });
    assert.equal(uploaded.status, 201);
    const media = await uploaded.json();
    assert.equal((await fetch(media.url)).status, 404, "unpublished media stays private");
    const profileUpdate = await request(`/userupdate/${owner.email}`, "PATCH", { avatar: media.url });
    assert.equal(profileUpdate.status, 200);
    assert.equal(profileUpdate.data.avatar, media.url);
    const stored = await Media.findById(media.id);
    await assert.rejects(readFile(path.join(mediaTestDirectory, stored.filename)), { code: "ENOENT" });
    const response = await fetch(media.url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal((await response.arrayBuffer()).byteLength, stored.bytes);
    const partial = await fetch(media.url, { headers: { Range: "bytes=0-1" } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get("content-range"), `bytes 0-1/${stored.bytes}`);
    assert.equal((await partial.arrayBuffer()).byteLength, 2);
  } finally {
    if (previousStage === undefined) delete process.env.TWILLER_DEPLOYMENT_STAGE;
    else process.env.TWILLER_DEPLOYMENT_STAGE = previousStage;
  }
});
