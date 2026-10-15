import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import User from "../models/user.js";
import LoginSession from "../models/loginSession.js";
import Throttle from "../models/throttle.js";
import Tweet from "../models/tweet.js";
import {
  userView,
  adminUserView,
  validateRequest,
  sessionId,
  requireAdmin,
  PUBLIC_USER_FIELDS,
  ADMIN_USER_FIELDS,
} from "../security.js";

process.env.NODE_ENV = "test";
const { app, securityDependencies } = await import("../index.js");

const users = new Map();
const sessions = new Map();
let currentToken = null;
let server;
let base;

const original = {};
function substitute(model, name, replacement) {
  original[`${model.modelName}:${name}`] = model[name];
  model[name] = replacement;
}

async function request(path, method = "GET", body, credential = "valid") {
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
    if (credential === "suspended-token") {
      return { uid: "suspended-uid", email: "suspended@example.test", auth_time: 100, email_verified: true };
    }
    if (credential === "valid" && currentToken) {
      return currentToken;
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

  substitute(User, "findOneAndUpdate", async (query, update) => {
    const user = users.get(String(query._id));
    if (user && update?.$set) Object.assign(user, update.$set);
    return user || null;
  });

  substitute(User, "updateOne", async (query, update) => {
    const user = users.get(String(query._id));
    if (user && update?.$set) Object.assign(user, update.$set);
    return { matchedCount: 1, modifiedCount: 1 };
  });

  substitute(Tweet, "create", async data => {
    return { _id: "222222222222222222222222", ...data, toJSON: () => ({ _id: "222222222222222222222222", ...data }) };
  });

  process.env.PORT = "0";
  const { startServer } = await import("../index.js");
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  // Seed test users
  const adminDoc = new User({
    _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    firebaseUid: "admin-uid",
    email: "admin@example.test",
    username: "adminuser",
    displayName: "Admin User",
    role: "admin",
    accountStatus: "active",
  });
  users.set(String(adminDoc._id), adminDoc);

  const normalDoc = new User({
    _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
    firebaseUid: "user-uid",
    email: "user@example.test",
    username: "normaluser",
    displayName: "Normal User",
    role: "user",
    accountStatus: "active",
  });
  users.set(String(normalDoc._id), normalDoc);

  const suspendedDoc = new User({
    _id: "cccccccccccccccccccccccc",
    firebaseUid: "suspended-uid",
    email: "suspended@example.test",
    username: "suspendeduser",
    displayName: "Suspended User",
    role: "user",
    accountStatus: "suspended",
  });
  users.set(String(suspendedDoc._id), suspendedDoc);

  // Setup verified sessions
  for (const [uid, authTime] of [["admin-uid", 100], ["user-uid", 100], ["suspended-uid", 100]]) {
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

test("User model sets default role to user and accountStatus to active", async () => {
  const user = new User({
    username: "defaultcheck",
    displayName: "Default Check",
    email: "default@example.test",
  });
  assert.equal(user.role, "user");
  assert.equal(user.accountStatus, "active");

  user.role = "admin";
  user.accountStatus = "suspended";
  await user.validate();

  user.role = "invalid_role";
  await assert.rejects(user.validate(), /is not a valid enum value for path `role`/);

  user.role = "user";
  user.accountStatus = "invalid_status";
  await assert.rejects(user.validate(), /is not a valid enum value for path `accountStatus`/);
});

test("public userView never leaks role, accountStatus, email, or secrets", () => {
  const user = new User({
    _id: "111111111111111111111111",
    username: "secretcheck",
    displayName: "Secret Check",
    email: "secret@example.test",
    phoneNumber: "+1234567890",
    role: "admin",
    accountStatus: "suspended",
    loginOtp: "123456",
  });

  const publicData = userView(user, false);
  assert.equal(publicData.username, "secretcheck");
  assert.equal(publicData.role, undefined);
  assert.equal(publicData.accountStatus, undefined);
  assert.equal(publicData.email, undefined);
  assert.equal(publicData.phoneNumber, undefined);
  assert.equal(publicData.loginOtp, undefined);

  // Private view (user inspecting self) includes safe account status and role
  const privateData = userView(user, true);
  assert.equal(privateData.role, "admin");
  assert.equal(privateData.accountStatus, "suspended");
  assert.equal(privateData.email, "secret@example.test");
  assert.equal(privateData.loginOtp, undefined);

  // adminUserView exposes role and accountStatus but excludes email, phone, and OTPs
  const adminData = adminUserView(user);
  assert.equal(adminData.role, "admin");
  assert.equal(adminData.accountStatus, "suspended");
  assert.equal(adminData.username, "secretcheck");
  assert.equal(adminData.email, undefined);
  assert.equal(adminData.phoneNumber, undefined);
  assert.equal(adminData.loginOtp, undefined);
});

test("registration and profile update refuse client-supplied role or accountStatus", () => {
  assert.throws(
    () => validateRequest("POST /register", { body: { username: "badactor", displayName: "Bad", role: "admin" } }),
    /Unsupported or invalid field: role/
  );
  assert.throws(
    () => validateRequest("POST /register", { body: { username: "badactor", displayName: "Bad", accountStatus: "suspended" } }),
    /Unsupported or invalid field: accountStatus/
  );
  assert.throws(
    () => validateRequest("PATCH /userupdate/:email", { params: { email: "user@example.test" }, body: { role: "admin" } }),
    /Unsupported or invalid field: role/
  );
  assert.throws(
    () => validateRequest("PATCH /userupdate/:email", { params: { email: "user@example.test" }, body: { accountStatus: "suspended" } }),
    /Unsupported or invalid field: accountStatus/
  );
});

test("GET /admin/overview enforces server-resolved admin authorization", async () => {
  // 1. Unauthenticated request => 401
  const unauth = await request("/admin/overview", "GET", undefined, null);
  assert.equal(unauth.status, 401);
  assert.equal(unauth.data.code, "AUTH_REQUIRED");

  // 2. Normal user request => 403 ADMIN_REQUIRED
  const normalUser = await request("/admin/overview", "GET", undefined, "user-token");
  assert.equal(normalUser.status, 403);
  assert.equal(normalUser.data.code, "ADMIN_REQUIRED");

  // 3. Normal user attempting privilege escalation via query params cannot elevate privilege
  const escalationAttempt = await request("/admin/overview?role=admin&isAdmin=true", "GET", undefined, "user-token");
  assert.equal(escalationAttempt.status, 400);
  assert.equal(escalationAttempt.data.code, "INVALID_INPUT");

  // 4. Admin user request => 200
  const adminUser = await request("/admin/overview", "GET", undefined, "admin-token");
  assert.equal(adminUser.status, 200);
  assert.equal(adminUser.data.status, "ok");
  assert.equal(adminUser.data.admin, "adminuser");
});

test("suspended users can read self/public data but cannot execute mutations", async () => {
  // 1. Suspended user can view their logged-in identity
  const selfView = await request("/loggedinuser", "GET", undefined, "suspended-token");
  assert.equal(selfView.status, 200);
  assert.equal(selfView.data.accountStatus, "suspended");
  assert.equal(selfView.data.username, "suspendeduser");

  // 2. Suspended user cannot create a post
  const postAttempt = await request("/post", "POST", { content: "Suspended post attempt" }, "suspended-token");
  assert.equal(postAttempt.status, 403);
  assert.equal(postAttempt.data.code, "ACCOUNT_SUSPENDED");
  assert.equal(postAttempt.data.error, "Your account is suspended.");

  // 3. Suspended user cannot update their profile
  const profileAttempt = await request("/userupdate/suspended@example.test", "PATCH", { bio: "new bio" }, "suspended-token");
  assert.equal(profileAttempt.status, 403);
  assert.equal(profileAttempt.data.code, "ACCOUNT_SUSPENDED");

  // 4. Suspended user cannot like a post
  const likeAttempt = await request("/like/222222222222222222222222", "POST", {}, "suspended-token");
  assert.equal(likeAttempt.status, 403);
  assert.equal(likeAttempt.data.code, "ACCOUNT_SUSPENDED");

  // 5. Active normal user is NOT blocked by suspension guard
  const activeProfile = await request("/userupdate/user@example.test", "PATCH", { bio: "updated bio" }, "user-token");
  assert.equal(activeProfile.status, 200);
});

test("promote-admin.mjs script refuses unconfirmed or missing target execution", () => {
  const script = fileURLToPath(new URL("../scripts/promote-admin.mjs", import.meta.url));

  // 1. Refuses execution without confirmation
  const unconfirmed = spawnSync(process.execPath, [script, "--username", "normaluser"], {
    encoding: "utf8",
    env: { ...process.env, TWILLER_PROMOTE_ADMIN_CONFIRMED: "" },
  });
  assert.notEqual(unconfirmed.status, 0);
  assert.match(unconfirmed.stderr, /Refusing admin promotion: explicit confirmation required/);

  // 2. Refuses execution without target identifier
  const missingTarget = spawnSync(process.execPath, [script, "--confirm"], {
    encoding: "utf8",
    env: {
      ...process.env,
      TWILLER_PROMOTE_ADMIN_CONFIRMED: "yes",
      MONGODB_URI: "mongodb://127.0.0.1:27017/twiller",
      ADMIN_FIREBASE_UID: "",
    },
  });
  assert.notEqual(missingTarget.status, 0);
  assert.match(missingTarget.stderr, /Provide a target via --uid, --email, --username/);

  // 3. Refuses remote Atlas without confirmation
  const atlasUnconfirmed = spawnSync(process.execPath, [script, "--username", "normaluser"], {
    encoding: "utf8",
    env: {
      ...process.env,
      MONGODB_URI: "mongodb+srv://user:pass@cluster.mongodb.net/twiller_staging",
      TWILLER_PROMOTE_ADMIN_CONFIRMED: "",
    },
  });
  assert.notEqual(atlasUnconfirmed.status, 0);
  assert.doesNotMatch(atlasUnconfirmed.stderr, /user:pass/);
});
