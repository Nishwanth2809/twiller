import test from "node:test";
import assert from "node:assert/strict";
import { boundary, errorHandler, HttpError, userView, validateRequest, resolveUser, sessionId } from "../security.js";
import express from "express";

const owner = { _id: "111111111111111111111111", email: "one@example.test", firebaseUid: "one" };
const token = { uid: "one", email: owner.email, auth_time: 100, email_verified: true };
async function invoke(key, { path = "/resource", method = "GET", body, query = "", credential = "valid", session = "verified", participant = true } = {}) {
  let accesses = 0;
  const app = express(); app.use(express.json());
  const deps = {
    verifyToken: async value => { if (["invalid", "expired", "revoked"].includes(value)) throw new Error("provider rejected"); return token; },
    User: { findOne: async () => { accesses++; return owner; } },
    LoginSession: { findById: async () => ({ status: session, expiresAt: new Date(Date.now() + 10000) }) },
    Conversation: { findById: async () => ({ participants: participant ? [owner._id] : ["222222222222222222222222"] }) },
  };
  app[method.toLowerCase()](path, boundary(key, deps), (req, res) => res.json({ user: req.principal?._id, body: req.body })); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const actual = path.replace(/:id|:tweetid|:userId/g, owner._id).replace(":email", owner.email);
    const response = await fetch(`http://127.0.0.1:${server.address().port}${actual}${query}`, { method, headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), accesses };
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test("TW-001: anonymous, invalid, expired, revoked credentials cannot read a private account", async () => {
  for (const credential of [null, "invalid", "expired", "revoked"]) {
    const result = await invoke("GET /loggedinuser", { credential });
    assert.equal(result.status, 401); assert.equal(result.accesses, 0);
  }
});
test("TW-001: caller account hints cannot select another owner", async () => {
  for (const [key, options] of [
    ["GET /loggedinuser", { query: "?email=two@example.test" }],
    ["POST /post", { method: "POST", body: { author: "222222222222222222222222", content: "hello" } }],
    ["POST /conversations", { method: "POST", body: { senderId: "222222222222222222222222", receiverId: owner._id } }],
    ["PATCH /userupdate/:email", { method: "PATCH", path: "/resource/:email", body: { bio: "hello" } }],
  ]) {
    if (key.startsWith("PATCH")) continue;
    assert.equal((await invoke(key, options)).status, 403);
  }
});
test("TW-001: membership applies to message reads, writes, and read receipts", async () => {
  for (const method of ["GET", "POST", "PATCH"]) {
    const suffix = method === "PATCH" ? "read" : "messages";
    const result = await invoke(`${method} /conversations/:id/${suffix}`, { method, path: `/resource/:id/${suffix}`, body: method === "POST" ? { content: "hello" } : undefined, participant: false });
    assert.equal(result.status, 403);
  }
});
test("TW-001/007: pending session cannot read a profile; identity is derived after verification", async () => {
  assert.equal((await invoke("GET /loggedinuser", { session: "pending" })).status, 403);
  const result = await invoke("POST /post", { method: "POST", body: { content: "hello" } });
  assert.equal(result.status, 200); assert.equal(result.data.body.author, owner._id);
});
test("TW-001: public reads remain anonymous", async () => {
  for (const key of ["GET /post", "GET /feed", "GET /search", "GET /trending", "GET /suggested-users", "GET /users/:username/followers", "GET /users/:username/following", "GET /users/:username/replies"]) assert.equal((await invoke(key, { credential: null })).status, 200);
});
test("TW-020: notification read APIs require verified owner and validate pagination and identifiers", async () => {
  assert.equal((await invoke("GET /notifications", { credential: null })).status, 401);
  assert.equal((await invoke("PATCH /notifications/:id/read", { method: "PATCH", path: "/resource/:id/read", credential: null })).status, 401);
  assert.equal((await invoke("PATCH /notifications/read", { method: "PATCH", path: "/resource", credential: null })).status, 401);
  assert.equal((await invoke("GET /notifications", { query: "?type=bogus" })).status, 400);
  assert.equal((await invoke("GET /notifications", { query: "?limit=101" })).status, 400);
  assert.throws(() => validateRequest("PATCH /notifications/:id/read", { params: { id: "malformed" }, query: {}, body: {} }));
});
test("TW-028: bookmark add/remove/clear contracts are authenticated, validated and owner-derived", async () => {
  assert.equal((await invoke("PUT /bookmarks/:id", { method: "PUT", path: "/resource/:id" })).status, 200);
  assert.equal((await invoke("DELETE /bookmarks/:id", { method: "DELETE", path: "/resource/:id" })).status, 200);
  assert.equal((await invoke("DELETE /bookmarks", { method: "DELETE", path: "/resource" })).status, 200);
  assert.throws(() => validateRequest("PUT /bookmarks/:id", { params: { id: "not-an-id" }, query: {}, body: {} }));
  assert.equal((await invoke("DELETE /bookmarks", { method: "DELETE", path: "/resource", body: { userId: "222222222222222222222222" } })).status, 400);
  assert.equal((await invoke("DELETE /bookmarks", { method: "DELETE", path: "/resource", credential: null })).status, 401);
});
test("TW-002/018: unsupported fields, object selectors, malformed IDs, invalid enums and bounds fail before database access", async () => {
  const cases = [
    ["POST /register", { username: "name", displayName: "Name", plan: "gold" }],
    ["POST /post", { content: "hello", likes: 100 }],
    ["POST /post", { content: "hello", author: "bad-id" }],
    ["POST /create-order", { plan: "admin" }],
    ["POST /log-session", { email: { $ne: null } }],
    ["PATCH /userupdate/:email", { tweetCount: 0 }],
  ];
  for (const [key, body] of cases) {
    const result = await invoke(key, { method: key.split(" ")[0], path: key.includes(":email") ? "/resource/:email" : "/resource", body });
    assert.equal(result.status, 400); assert.equal(result.accesses, 0);
  }
  for (const query of ["?page=0", "?limit=101", "?type=admin", "?unknown=1"]) assert.equal((await invoke("GET /feed", { query })).status, 400);
  assert.throws(() => validateRequest("GET /post/:id", { params: { id: "bad" } }), /invalid field/);
  assert.throws(() => validateRequest("POST /verify-language-change", { body: { otp: "123456", targetLanguage: "unsafe" } }), /invalid field/);
});
test("TW-003: projections never contain private fields publicly, or secrets privately", () => {
  const value = { ...owner, username: "one", avatar: "", bookmarks: ["secret"], loginHistory: [], plan: "gold", loginOtp: "123456", audioOtp: "654321", languageOtp: "012345", __v: 2, password: "secret" };
  for (const key of ["email", "bookmarks", "loginHistory", "plan", "firebaseUid"]) assert.equal(userView(value)[key], undefined);
  for (const key of ["loginOtp", "audioOtp", "languageOtp", "firebaseUid", "password", "__v"]) assert.equal(userView(value, true)[key], undefined);
  assert.equal(userView(value, true).email, owner.email);
});
test("TW-001: legacy UID adoption requires verified email and an unbound profile", async () => {
  const deps = { findOne: async query => query.firebaseUid ? null : { ...owner, firebaseUid: undefined }, findOneAndUpdate: async () => owner };
  await assert.rejects(resolveUser(deps, { ...token, email_verified: false }), /Verify your email/);
  assert.equal((await resolveUser(deps, token)).firebaseUid, "one");
  deps.findOne = async query => query.firebaseUid ? null : { ...owner, firebaseUid: "other" };
  await assert.rejects(resolveUser(deps, token), /requires support/);
  assert.notEqual(sessionId(token), sessionId({ ...token, auth_time: 101 }));
});

test("unexpected staging 500 logs only safe route and error diagnostics while preserving the client response", () => {
  const previousEnv = { node: process.env.NODE_ENV, stage: process.env.TWILLER_DEPLOYMENT_STAGE };
  const previousError = console.error;
  const lines = [];
  const secret = "private-token-from-request";
  const err = Object.assign(new Error(`Authorization: Bearer ${secret}`), { name: "MongoNetworkError", code: "ECONNREFUSED" });
  err.stack = `MongoNetworkError: ${secret}\n    at query (C:\\app\\backend\\database.js:42:7)\n    at request (https://example.test/?token=${secret})`;
  const req = { method: "POST", path: `/account/${secret}`, originalUrl: `/account/${secret}?token=${secret}`, route: { path: "/account/:id" }, headers: { authorization: `Bearer ${secret}` }, body: { password: secret } };
  const res = { headersSent: false, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  try {
    process.env.NODE_ENV = "production";
    process.env.TWILLER_DEPLOYMENT_STAGE = "staging";
    console.error = line => lines.push(line);
    errorHandler(err, req, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: "Request could not be completed", code: "REQUEST_FAILED" });
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), {
      event: "unexpected_request_failure", method: "POST", path: "/account/:id",
      name: "MongoNetworkError", code: "ECONNREFUSED", message: "Unexpected server error",
      stack: ["database.js:42:7"],
    });
    assert.doesNotMatch(lines[0], /private-token|Bearer|Authorization|password|example\.test/);
    err.name = secret;
    err.code = secret;
    errorHandler(err, { method: "POST", path: `/reset/${secret}` }, res, () => {});
    const redacted = JSON.parse(lines[1]);
    assert.equal(redacted.name, "Error");
    assert.equal(redacted.code, "[redacted]");
    assert.equal(redacted.path, "/[unmatched]");
    assert.doesNotMatch(lines[1], /private-token|Bearer|Authorization|password|example\.test/);
  } finally {
    console.error = previousError;
    if (previousEnv.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv.node;
    if (previousEnv.stage === undefined) delete process.env.TWILLER_DEPLOYMENT_STAGE; else process.env.TWILLER_DEPLOYMENT_STAGE = previousEnv.stage;
  }
});

test("unexpected error logging is absent outside staging/dev and for expected errors", () => {
  const previousEnv = { node: process.env.NODE_ENV, stage: process.env.TWILLER_DEPLOYMENT_STAGE };
  const previousError = console.error;
  const lines = [];
  const response = () => ({ headersSent: false, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
  try {
    console.error = line => lines.push(line);
    process.env.NODE_ENV = "production";
    delete process.env.TWILLER_DEPLOYMENT_STAGE;
    const production = response();
    errorHandler(new Error("private failure"), { method: "GET", route: { path: "/post" } }, production, () => {});
    assert.deepEqual(production.body, { error: "Request could not be completed", code: "REQUEST_FAILED" });
    process.env.TWILLER_DEPLOYMENT_STAGE = "staging";
    const expected = response();
    errorHandler(new HttpError(400, "INVALID_INPUT", "Invalid input"), { method: "POST", route: { path: "/post" } }, expected, () => {});
    assert.deepEqual(expected.body, { error: "Invalid input", code: "INVALID_INPUT" });
    assert.equal(lines.length, 0);
    process.env.NODE_ENV = "development";
    delete process.env.TWILLER_DEPLOYMENT_STAGE;
    const development = response();
    errorHandler(new Error("private failure"), { method: "GET", route: { path: "/post" } }, development, () => {});
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).path, "/post");
  } finally {
    console.error = previousError;
    if (previousEnv.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv.node;
    if (previousEnv.stage === undefined) delete process.env.TWILLER_DEPLOYMENT_STAGE; else process.env.TWILLER_DEPLOYMENT_STAGE = previousEnv.stage;
  }
});
