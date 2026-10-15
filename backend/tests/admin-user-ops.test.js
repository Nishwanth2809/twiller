import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../models/user.js";
import Tweet from "../models/tweet.js";
import LoginSession from "../models/loginSession.js";
import Throttle from "../models/throttle.js";
import Media from "../models/media.js";
import AdminAuditLog from "../models/adminAuditLog.js";
import { sessionId } from "../security.js";

process.env.NODE_ENV = "test";
const { app, securityDependencies } = await import("../index.js");

const users = new Map();
const sessions = new Map();
const tweets = new Map();
const auditLogs = [];
let server;
let base;

const original = {};
function substitute(model, name, replacement) {
  original[`${model.modelName}:${name}`] = model[name];
  model[name] = replacement;
}

async function request(path, method = "GET", body, credential = "admin-token") {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}

before(async () => {
  substitute(Throttle, "findOneAndUpdate", async () => ({ count: 1 }));
  substitute(LoginSession, "updateOne", async () => ({ modifiedCount: 1 }));
  substitute(LoginSession, "findById", async key => sessions.get(key));
  substitute(LoginSession, "deleteMany", async query => {
    let count = 0;
    for (const [key, s] of sessions.entries()) {
      if (query.uid && s.uid === query.uid) {
        sessions.delete(key);
        count++;
      }
    }
    return { deletedCount: count };
  });

  original["mongoose:startSession"] = mongoose.startSession;
  mongoose.startSession = async () => ({
    withTransaction: async fn => fn(),
    endSession: async () => {},
  });

  securityDependencies.verifyToken = async credential => {
    if (credential === "admin-token") {
      return { uid: "admin-uid", email: "admin@example.test", auth_time: 100, email_verified: true };
    }
    if (credential === "user-token") {
      return { uid: "user-uid", email: "user@example.test", auth_time: 100, email_verified: true };
    }
    if (credential === "other-admin-token") {
      return { uid: "other-admin-uid", email: "otheradmin@example.test", auth_time: 100, email_verified: true };
    }
    throw new Error("Invalid credential");
  };

  substitute(User, "findOne", query => {
    return Promise.resolve([...users.values()].find(user => {
      if (query.firebaseUid) return user.firebaseUid === query.firebaseUid;
      if (query.email) return user.email === query.email;
      if (query.username) return user.username === query.username;
      return false;
    }));
  });

  substitute(User, "findById", id => {
    return Promise.resolve(users.get(String(id)) || null);
  });

  substitute(User, "find", query => {
    let list = [...users.values()];
    if (query.accountStatus?.$ne) {
      list = list.filter(u => u.accountStatus !== query.accountStatus.$ne);
    }
    if (query.$or) {
      list = list.filter(u => query.$or.some(clause => {
        if (clause.username) return clause.username.test(u.username);
        if (clause.displayName) return clause.displayName.test(u.displayName);
        return false;
      }));
    }
    return {
      sort() { return this; },
      limit(n) {
        return Promise.resolve(list.slice(0, n));
      },
    };
  });

  substitute(User, "updateOne", async (query, update) => {
    const user = users.get(String(query._id));
    if (user) {
      if (update.$set) Object.assign(user, update.$set);
      if (update.$unset?.firebaseUid) {
        delete user.firebaseUid;
        if (user._doc) delete user._doc.firebaseUid;
        user.firebaseUid = undefined;
      }
    }
    return { matchedCount: user ? 1 : 0, modifiedCount: user ? 1 : 0 };
  });

  substitute(User, "updateMany", async () => ({ modifiedCount: 1 }));

  substitute(Tweet, "find", query => {
    const list = [...tweets.values()].filter(t => String(t.author) === String(query.author));
    return Promise.resolve(list);
  });

  substitute(Tweet, "countDocuments", query => {
    let list = [...tweets.values()];
    if (query.author) list = list.filter(t => String(t.author) === String(query.author));
    if (query.parentId === null) list = list.filter(t => !t.parentId);
    if (query.parentId?.$ne !== undefined) list = list.filter(t => !!t.parentId);
    if (query.deletedAt === null) list = list.filter(t => !t.deletedAt);
    return Promise.resolve(list.length);
  });

  substitute(Tweet, "findById", id => {
    const t = tweets.get(String(id)) || null;
    return {
      session() { return this; },
      then(resolve) { resolve(t); },
    };
  });

  substitute(Tweet, "exists", query => {
    let result = false;
    if (query.parentId) {
      result = [...tweets.values()].some(t => String(t.parentId) === String(query.parentId));
    }
    return {
      session() { return this; },
      then(resolve) { resolve(result); },
    };
  });

  substitute(Tweet, "updateOne", (query, update) => {
    const tweet = tweets.get(String(query._id));
    if (tweet && update.$set) Object.assign(tweet, update.$set);
    return {
      session() { return this; },
      then(resolve) { resolve({ matchedCount: tweet ? 1 : 0, modifiedCount: tweet ? 1 : 0 }); },
    };
  });

  substitute(Tweet, "deleteOne", (query) => {
    const existed = tweets.delete(String(query._id));
    return {
      session() { return this; },
      then(resolve) { resolve({ deletedCount: existed ? 1 : 0 }); },
    };
  });

  substitute(Media, "updateMany", async () => ({ modifiedCount: 1 }));
  substitute(Media, "updateOne", async () => ({ modifiedCount: 1 }));

  substitute(AdminAuditLog, "create", async (data) => {
    const items = Array.isArray(data) ? data : [data];
    const created = items.map(d => ({ _id: new mongoose.Types.ObjectId(), ...d, createdAt: new Date() }));
    auditLogs.push(...created);
    return Array.isArray(data) ? created : created[0];
  });

  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  // Seed Admin
  const adminDoc = new User({
    _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    firebaseUid: "admin-uid",
    email: "admin@example.test",
    username: "superadmin",
    displayName: "Super Admin",
    role: "admin",
    accountStatus: "active",
  });
  users.set(String(adminDoc._id), adminDoc);

  // Seed Another Admin
  const otherAdminDoc = new User({
    _id: "dddddddddddddddddddddddd",
    firebaseUid: "other-admin-uid",
    email: "otheradmin@example.test",
    username: "otheradmin",
    displayName: "Other Admin",
    role: "admin",
    accountStatus: "active",
  });
  users.set(String(otherAdminDoc._id), otherAdminDoc);

  // Seed Normal User
  const normalDoc = new User({
    _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
    firebaseUid: "user-uid",
    email: "user@example.test",
    username: "regularjoe",
    displayName: "Regular Joe",
    role: "user",
    accountStatus: "active",
    phoneNumber: "+15551234567",
    loginOtp: "987654",
  });
  users.set(String(normalDoc._id), normalDoc);

  // Seed Tweets for Normal User (1 root post with reply, 1 reply, 1 leaf post)
  tweets.set("111111111111111111111111", {
    _id: "111111111111111111111111",
    author: normalDoc._id,
    content: "Root post with a reply",
    parentId: null,
    deletedAt: null,
  });
  tweets.set("222222222222222222222222", {
    _id: "222222222222222222222222",
    author: normalDoc._id,
    content: "A reply to root post",
    parentId: "111111111111111111111111",
    deletedAt: null,
  });
  tweets.set("333333333333333333333333", {
    _id: "333333333333333333333333",
    author: normalDoc._id,
    content: "A leaf post with no replies",
    parentId: null,
    deletedAt: null,
  });

  // Setup sessions
  for (const [uid, authTime] of [["admin-uid", 100], ["user-uid", 100], ["other-admin-uid", 100]]) {
    const sessKey = sessionId({ uid, auth_time: authTime });
    sessions.set(sessKey, { _id: sessKey, uid, status: "verified", expiresAt: new Date(Date.now() + 600000) });
  }
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("GET /admin/users lists users with bounded pagination and safe projection", async () => {
  // 1. Unauthenticated request => 401
  assert.equal((await request("/admin/users", "GET", undefined, null)).status, 401);

  // 2. Normal user request => 403
  assert.equal((await request("/admin/users", "GET", undefined, "user-token")).status, 403);

  // 3. Admin request => 200 with list
  const res = await request("/admin/users?limit=10");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.users));
  assert.ok(res.data.users.length >= 2);

  // Verify safe projection: NEVER exposes phone, email, loginOtp, etc.
  const joe = res.data.users.find(u => u.username === "regularjoe");
  assert.ok(joe);
  assert.equal(joe.username, "regularjoe");
  assert.equal(joe.role, "user");
  assert.equal(joe.accountStatus, "active");
  assert.equal(joe.email, undefined);
  assert.equal(joe.phoneNumber, undefined);
  assert.equal(joe.loginOtp, undefined);

  // 4. Search query filter
  const searchRes = await request("/admin/users?q=joe");
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.data.users.length, 1);
  assert.equal(searchRes.data.users[0].username, "regularjoe");
});

test("GET /admin/users/:id returns user details and activity stats with zero DM exposure", async () => {
  const joeId = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const res = await request(`/admin/users/${joeId}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.user.username, "regularjoe");
  assert.equal(res.data.user.email, undefined); // strictly private
  assert.equal(res.data.user.phoneNumber, undefined); // strictly private
  assert.equal(res.data.stats.posts, 2); // 2 root posts
  assert.equal(res.data.stats.replies, 1); // 1 reply
  assert.equal(res.data.conversations, undefined); // Zero DM data
  assert.equal(res.data.messages, undefined); // Zero DM data

  // Invalid ID => 400
  assert.equal((await request("/admin/users/invalid-id")).status, 400);

  // Non-existent ID => 404
  assert.equal((await request("/admin/users/999999999999999999999999")).status, 404);
});

test("PATCH /admin/users/:id/status freezes and resumes account with audit logs", async () => {
  const joeId = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const joeUid = "user-uid";
  const adminId = "aaaaaaaaaaaaaaaaaaaaaaaa";

  // 1. Admin cannot freeze self => 400
  const selfFreeze = await request(`/admin/users/${adminId}/status`, "PATCH", { status: "frozen" });
  assert.equal(selfFreeze.status, 400);
  assert.equal(selfFreeze.data.code, "CANNOT_MODIFY_SELF");

  // 2. Admin cannot freeze another admin => 403
  const otherAdminId = "dddddddddddddddddddddddd";
  const adminFreeze = await request(`/admin/users/${otherAdminId}/status`, "PATCH", { status: "frozen" });
  assert.equal(adminFreeze.status, 403);
  assert.equal(adminFreeze.data.code, "CANNOT_MODIFY_ADMIN");

  // 3. Freeze normal user => 200
  const freezeRes = await request(`/admin/users/${joeId}/status`, "PATCH", {
    status: "frozen",
    reason: "Suspected spam violation",
  });
  assert.equal(freezeRes.status, 200);
  assert.equal(freezeRes.data.accountStatus, "frozen");

  // Verify sessions were revoked for frozen user
  assert.equal(sessions.has(sessionId({ uid: joeUid, auth_time: 100 })), false);

  // Verify audit log entry
  const freezeLog = auditLogs.find(l => l.action === "USER_FROZEN" && String(l.targetId) === joeId);
  assert.ok(freezeLog);
  assert.equal(freezeLog.reason, "Suspected spam violation");
  assert.equal(String(freezeLog.admin), adminId);

  // 4. Resume normal user => 200
  const resumeRes = await request(`/admin/users/${joeId}/status`, "PATCH", {
    status: "active",
    reason: "Identity confirmed clean",
  });
  assert.equal(resumeRes.status, 200);
  assert.equal(resumeRes.data.accountStatus, "active");

  // Verify audit log entry for resumption
  const resumeLog = auditLogs.find(l => l.action === "USER_RESUMED" && String(l.targetId) === joeId);
  assert.ok(resumeLog);
  assert.equal(resumeLog.reason, "Identity confirmed clean");
});

test("DELETE /admin/users/:id deletes account, cleans graph, tombstones posts, and creates audit entry", async () => {
  const adminId = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const victimDoc = new User({
    _id: "eeeeeeeeeeeeeeeeeeeeeeee",
    firebaseUid: "victim-uid",
    email: "victim@example.test",
    username: "spammer",
    displayName: "Spammer Account",
    role: "user",
    accountStatus: "active",
  });
  users.set(String(victimDoc._id), victimDoc);

  // Seed victim's root post with reply, and leaf post
  tweets.set("444444444444444444444444", {
    _id: "444444444444444444444444",
    author: victimDoc._id,
    content: "Spam parent post with replies",
    parentId: null,
    deletedAt: null,
  });
  // Mock reply to victim's post
  tweets.set("555555555555555555555555", {
    _id: "555555555555555555555555",
    author: "bbbbbbbbbbbbbbbbbbbbbbbb",
    content: "Reply from regular user",
    parentId: "444444444444444444444444",
    deletedAt: null,
  });
  // Victim's leaf post
  tweets.set("666666666666666666666666", {
    _id: "666666666666666666666666",
    author: victimDoc._id,
    content: "Spam leaf post",
    parentId: null,
    deletedAt: null,
  });

  const victimId = String(victimDoc._id);

  // 1. Admin cannot delete self
  const selfDel = await request(`/admin/users/${adminId}`, "DELETE", { reason: "test" });
  assert.equal(selfDel.status, 400);
  assert.equal(selfDel.data.code, "CANNOT_DELETE_SELF");

  // 2. Admin cannot delete another admin
  const otherAdminId = "dddddddddddddddddddddddd";
  const adminDel = await request(`/admin/users/${otherAdminId}`, "DELETE", { reason: "test" });
  assert.equal(adminDel.status, 403);
  assert.equal(adminDel.data.code, "CANNOT_DELETE_ADMIN");

  // 3. Delete normal user
  const delRes = await request(`/admin/users/${victimId}`, "DELETE", {
    reason: "Repeated malicious spamming",
  });
  assert.equal(delRes.status, 200);
  assert.equal(delRes.data.success, true);

  // 4. Verify victim user is marked deleted
  const deletedUser = users.get(victimId);
  assert.equal(deletedUser.accountStatus, "deleted");
  assert.equal(deletedUser.firebaseUid, undefined);
  assert.match(deletedUser.username, /^deleted_/);

  // 5. Verify thread post with replies was tombstoned (not hard-deleted)
  const tombstonedPost = tweets.get("444444444444444444444444");
  assert.ok(tombstonedPost);
  assert.ok(tombstonedPost.deletedAt);
  assert.equal(tombstonedPost.content, "");

  // 6. Verify leaf post was deleted
  assert.equal(tweets.has("666666666666666666666666"), false);

  // 7. Verify audit log was recorded
  const deleteLog = auditLogs.find(l => l.action === "USER_DELETED" && String(l.targetId) === victimId);
  assert.ok(deleteLog);
  assert.equal(deleteLog.reason, "Repeated malicious spamming");
  assert.equal(String(deleteLog.admin), adminId);
});

test("DELETE /admin/posts/:id removes post, preserves conversation trees, and records audit entry", async () => {
  const adminId = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const authorId = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const regularToken = "user-token";

  const leafPostId = "777777777777777777777777";
  const threadParentId = "888888888888888888888888";
  const threadReplyId = "999999999999999999999999";

  tweets.set(leafPostId, {
    _id: leafPostId,
    author: authorId,
    content: "Offensive standalone post",
    parentId: null,
    deletedAt: null,
  });

  tweets.set(threadParentId, {
    _id: threadParentId,
    author: authorId,
    content: "Offensive root post in deep discussion",
    parentId: null,
    deletedAt: null,
  });

  tweets.set(threadReplyId, {
    _id: threadReplyId,
    author: "cccccccccccccccccccccccc",
    content: "Valuable reply to offensive post",
    parentId: threadParentId,
    deletedAt: null,
  });

  // 1. Regular user cannot delete another's post via admin route
  const nonAdminRes = await request(`/admin/posts/${leafPostId}`, "DELETE", { reason: "test" }, regularToken);
  assert.equal(nonAdminRes.status, 403);
  assert.equal(nonAdminRes.data.code, "ADMIN_REQUIRED");

  // 2. Admin cannot delete non-existent post
  const notFoundRes = await request("/admin/posts/000000000000000000000000", "DELETE", { reason: "test" });
  assert.equal(notFoundRes.status, 404);
  assert.equal(notFoundRes.data.code, "POST_NOT_FOUND");

  // 3. Admin deletes leaf post (hard delete)
  const leafRes = await request(`/admin/posts/${leafPostId}`, "DELETE", {
    reason: "Severe hate speech violation",
  });
  assert.equal(leafRes.status, 200);
  assert.equal(leafRes.data.success, true);
  assert.equal(tweets.has(leafPostId), false);

  const leafAudit = auditLogs.find(l => l.action === "POST_REMOVED" && String(l.targetId) === leafPostId);
  assert.ok(leafAudit);
  assert.equal(leafAudit.reason, "Severe hate speech violation");
  assert.equal(String(leafAudit.admin), adminId);

  // 4. Admin deletes post with replies (soft tombstone)
  const threadRes = await request(`/admin/posts/${threadParentId}`, "DELETE", {
    reason: "Doxxing content in active debate",
  });
  assert.equal(threadRes.status, 200);
  assert.equal(threadRes.data.success, true);

  const tombstoned = tweets.get(threadParentId);
  assert.ok(tombstoned);
  assert.ok(tombstoned.deletedAt);
  assert.equal(tombstoned.content, "");
  // Reply still intact
  assert.ok(tweets.has(threadReplyId));

  const threadAudit = auditLogs.find(l => l.action === "POST_REMOVED" && String(l.targetId) === threadParentId);
  assert.ok(threadAudit);
  assert.equal(threadAudit.reason, "Doxxing content in active debate");
});

