import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import User from "../models/user.js";
import Tweet from "../models/tweet.js";
import LoginSession from "../models/loginSession.js";
import { sessionId, otpHash } from "../security.js";
import { deliverEmail } from "../mail.js";
import Throttle from "../models/throttle.js";

process.env.NODE_ENV = "test";
const { app, securityDependencies, mailDependencies, sendInvoiceEmail } = await import("../index.js");
const users = new Map(); const sessions = new Map(); let sent = []; let failCreate = false;
const token = { uid: "signup", email: "signup@example.test", auth_time: 100, email_verified: false };
const id = "111111111111111111111111";
const original = {};
function substitute(model, name, replacement) { original[`${model.modelName}:${name}`] = model[name]; model[name] = replacement; }
let server; let base;
async function request(path, method = "GET", body, credential = "valid") {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  // Controlled rate-store boundary; real Mongo tests separately verify abuse limits.
  substitute(Throttle, "findOneAndUpdate", async () => ({ count: 1 }));
  substitute(LoginSession, "updateOne", async () => ({ modifiedCount: 1 }));
  securityDependencies.verifyToken = async credential => { if (credential !== "valid") throw new Error("expired"); return token; };
  substitute(User, "findOne", query => Promise.resolve([...users.values()].find(user => query.firebaseUid ? user.firebaseUid === query.firebaseUid : user.email === query.email)));
  substitute(User, "updateOne", async () => ({ modifiedCount: 1 }));
  substitute(User, "create", async value => {
    if (failCreate) throw new Error("isolated save failure");
    const user = new User({ ...value, _id: id }); await user.validate(); users.set(id, user); return user;
  });
  substitute(LoginSession, "findById", async key => sessions.get(key));
  substitute(LoginSession, "findOneAndUpdate", async (query, update, options) => {
    let value = sessions.get(query._id);
    if (!value && !options?.upsert) return null;
    if (typeof query.status === "string" && value?.status !== query.status || query.status?.$ne && value?.status === query.status.$ne || query.otpHash && value?.otpHash !== query.otpHash || query.otpExpiresAt && value?.otpExpiresAt <= query.otpExpiresAt.$gt || query.expiresAt && value?.expiresAt <= query.expiresAt.$gt) return null;
    value ||= { _id: query._id };
    Object.assign(value, update.$set); for (const key of Object.keys(update.$unset || {})) delete value[key];
    sessions.set(query._id, value); return value;
  });
  substitute(LoginSession, "deleteOne", async query => { const value = sessions.get(query._id); if (value?.otpHash === query.otpHash) sessions.delete(query._id); });
  mailDependencies.send = async value => { sent.push(value); };
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  for (const model of [User, Tweet, LoginSession, Throttle]) for (const [key, value] of Object.entries(original)) if (key.startsWith(`${model.modelName}:`)) model[key.split(":")[1]] = value;
});
test("invoice mail uses the shared Apps Script provider without EMAIL_USER", async () => {
  const priorSender=process.env.EMAIL_USER;
  const priorSend=mailDependencies.send;
  const captured=[];
  try {
    delete process.env.EMAIL_USER;
    mailDependencies.send=value=>deliverEmail(value,{
      appsScriptUrl:"https://provider.invalid/private",
      appsScriptSecret:"fixture-server-secret-32-characters-long",
      fetchImpl:async (_url,options)=>{captured.push(JSON.parse(options.body).mail);return {ok:true,status:200,json:async()=>({success:true})};},
      logger:{error(){}},
    });
    await sendInvoiceEmail("buyer@example.test","Fixture Buyer","bronze","pay_fixture",10000);
    assert.equal(captured.length,1);
    assert.deepEqual(Object.keys(captured[0]).sort(),["html","subject","to"]);
    assert.equal(captured[0].to,"buyer@example.test");
  } finally {
    if(priorSender===undefined)delete process.env.EMAIL_USER;
    else process.env.EMAIL_USER=priorSender;
    mailDependencies.send=priorSend;
  }
});
test("TW-006: signup without avatar and idempotent retry after failed application registration", async () => {
  const input = { username: "signup_fixture", displayName: "Signup" };
  failCreate = true; assert.equal((await request("/register", "POST", input)).status, 500); assert.equal(users.size, 0);
  failCreate = false; const registered = await request("/register", "POST", input);
  assert.equal(registered.status, 201); assert.equal(registered.data.avatar, ""); assert.equal(registered.data.email, undefined);
  assert.equal((await request("/register", "POST", input)).status, 200); assert.equal(users.size, 1);
  assert.equal(users.get(id).firebaseUid, token.uid);
});
test("TW-007: OTP pending, invalid, refresh, expiry, success, replay and logout", async () => {
  assert.equal((await request("/loggedinuser")).data.code, "OTP_REQUIRED");
  const pending = await request("/log-session", "POST", {}); assert.equal(pending.data.requiresOtp, true);
  const mailed = sent.at(-1).html.match(/<strong>(\d{6})<\/strong>/)[1];
  assert.equal((await request("/verify-login-otp", "POST", { otp: "000000" })).status, 400);
  const before = sent.length;
  assert.equal((await request("/log-session", "POST", {})).data.requiresOtp, true); assert.equal(sent.length, before);
  assert.equal((await request("/loggedinuser")).status, 403);
  const session = sessions.get(sessionId(token)); session.otpExpiresAt = new Date(0);
  assert.equal((await request("/verify-login-otp", "POST", { otp: mailed })).status, 400);
  await request("/log-session", "POST", {});
  const fresh = sent.at(-1).html.match(/<strong>(\d{6})<\/strong>/)[1];
  assert.notEqual(session.otpHash, fresh);
  assert.equal((await request("/verify-login-otp", "POST", { otp: fresh })).status, 200);
  assert.equal((await request("/verify-login-otp", "POST", { otp: fresh })).status, 400);
  assert.equal((await request("/log-session", "POST", {})).data.requiresOtp, false);
  const privateRead = await request("/loggedinuser"); assert.equal(privateRead.status, 200); assert.equal(privateRead.data.email, token.email); assert.equal(privateRead.data.firebaseUid, undefined);
  await request("/logout", "POST", {});
  assert.equal((await request("/loggedinuser")).status, 403); assert.equal((await request("/log-session", "POST", {})).status, 401);
});
test("TW-007: failed OTP delivery leaves retry available and never verifies a session", async () => {
  token.auth_time++;
  mailDependencies.send = async () => { throw new Error("mail failure"); };
  assert.equal((await request("/log-session", "POST", {})).status, 503);
  assert.equal(sessions.has(sessionId(token)), false);
  mailDependencies.send = async value => { sent.push(value); };
  assert.equal((await request("/log-session", "POST", {})).data.requiresOtp, true);
});
test("TW-003: real post/feed handlers request safe populated author fields", async () => {
  const sensitive = { username: "signup", displayName: "Signup", _id: id, email: token.email, loginOtp: "123456", audioOtp: "234567", languageOtp: "345678", bookmarks: ["secret"], firebaseUid: token.uid };
  const query = { sort() { return this; }, skip() { return this; }, limit() { return this; }, populate(path, fields) {
    assert.equal(path, "author"); assert.ok(fields && !fields.includes("email"));
    this.result = [{ _id: "222222222222222222222222", content: "public", author: Object.fromEntries(fields.split(" ").filter(key => sensitive[key] !== undefined).map(key => [key, sensitive[key]])) }]; return this;
  }, then(resolve) { return Promise.resolve(this.result).then(resolve); } };
  substitute(Tweet, "find", () => Object.create(query)); substitute(Tweet, "countDocuments", async () => 1);
  for (const path of ["/post", "/feed", `/post/${id}/replies`]) {
    const result = await request(path, "GET", undefined, null); assert.equal(result.status, 200);
    const post = Array.isArray(result.data) ? result.data[0] : result.data.tweets[0];
    for (const key of ["email", "loginOtp", "audioOtp", "languageOtp", "bookmarks", "firebaseUid"]) assert.equal(post.author[key], undefined);
    assert.equal(post.author.displayName, "Signup");
  }
});
test("TW-004: recovery only requests a provider proof link; delivery/unknown accounts are safe", async () => {
  let calls = 0;
  const oldFind = User.findOne;
  User.findOne = query => query.phoneNumber ? { select: async () => query.phoneNumber === "+15550001111" ? { email: token.email } : null } : oldFind(query);
  mailDependencies.resetLink = async () => { calls++; return "https://example.test/reset?oobCode=isolated-proof"; };
  const before = JSON.stringify(users.get(id));
  const response = await request("/forgot-password", "POST", { email: token.email }, null);
  assert.equal(response.status, 200); assert.equal(calls, 1); assert.equal(JSON.stringify(users.get(id)), before);
  assert.equal(response.data.generatedPassword, undefined); assert.ok(!JSON.stringify(response.data).includes("isolated-proof"));
  assert.ok(sent.at(-1).html.includes("isolated-proof"));
  assert.deepEqual(await request("/forgot-password", "POST", { email: "+15550001111" }, null), response);
  assert.equal(sent.at(-1).to, token.email);
  assert.deepEqual(await request("/forgot-password", "POST", { email: "+15550002222" }, null), response);
  assert.equal(JSON.stringify(users.get(id)), before);
  User.findOne = oldFind;
  // A caller cannot turn this request endpoint into a proof/password mutation.
  for (const proof of ["expired-proof", "reused-proof"]) {
    assert.equal((await request("/forgot-password", "POST", { email: token.email, oobCode: proof, password: "attempted-replacement" }, null)).status, 400);
    assert.equal(JSON.stringify(users.get(id)), before);
  }
  mailDependencies.resetLink = async () => { throw Object.assign(new Error("unknown"), { code: "auth/user-not-found" }); };
  const unknown = await request("/forgot-password", "POST", { email: "unknown@example.test" }, null);
  assert.deepEqual(unknown, response);
  mailDependencies.resetLink = async () => "https://example.test/reset";
  mailDependencies.send = async () => { throw new Error("delivery failed"); };
  assert.equal((await request("/forgot-password", "POST", { email: token.email }, null)).status, 503);
  assert.equal(JSON.stringify(users.get(id)), before);
});

test("TW-004: Apps Script failure maps fallback success and total failure to safe recovery responses", async () => {
  const previous = mailDependencies.send;
  const profileBefore = JSON.stringify(users.get(id));
  try {
    for (const fallbackSucceeds of [true, false]) {
      mailDependencies.send = options => deliverEmail(options, {
        appsScriptUrl: "https://provider.invalid/private",
        appsScriptSecret: "fixture-server-secret-32-characters-long",
        fetchImpl: async () => ({ok:false,status:500}),
        sendSmtp: async () => {
          if (!fallbackSucceeds) throw new Error("private provider internals");
          return { accepted: [token.email], rejected: [] };
        }, logger: { error() {} },
      });
      const result = await request("/forgot-password", "POST", { email: token.email }, null);
      assert.equal(result.status, fallbackSucceeds ? 200 : 503);
      if (!fallbackSucceeds) assert.equal(result.data.code, "RECOVERY_UNAVAILABLE");
      assert.equal(JSON.stringify(result.data).includes("provider"), false);
      assert.equal(JSON.stringify(result.data).includes("isolated-proof"), false);
      assert.equal(JSON.stringify(users.get(id)), profileBefore);
    }
  } finally { mailDependencies.send = previous; }
});

test("TW-007: actual delivery helper failure removes challenge and does not grant access", async () => {
  const previous = mailDependencies.send;
  token.auth_time++;
  try {
    mailDependencies.send = options => deliverEmail(options, {
      appsScriptUrl: "https://provider.invalid/private",
      appsScriptSecret: "fixture-server-secret-32-characters-long",
      fetchImpl: async () => ({ok:true,status:200,json:async()=>({success:false})}),
      sendSmtp: async () => { throw new Error("private SMTP credentials"); },
      logger: { error() {} },
    });
    const result = await request("/log-session", "POST", {});
    assert.equal(result.status, 503); assert.equal(result.data.code, "DELIVERY_FAILED");
    assert.equal(sessions.has(sessionId(token)), false);
    assert.equal((await request("/loggedinuser")).status, 403);
    assert.equal(JSON.stringify(result.data).includes("credentials"), false);
  } finally { mailDependencies.send = previous; }
});
