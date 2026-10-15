import crypto from "node:crypto";
import { decodeCursor } from "./pagination.js";

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new HttpError(status, code, message); };
export const PUBLIC_USER_FIELDS = "_id username displayName avatar bio location website joinedDate followers following";
const privateFields = `${PUBLIC_USER_FIELDS} email phoneNumber plan tweetCount planExpiresAt planActivatedAt notificationsEnabled language loginHistory bookmarks`;
export function userView(user, privateView = false) {
  if (!user) return null;
  const source = user.toObject ? user.toObject() : user;
  return Object.fromEntries((privateView ? privateFields : PUBLIC_USER_FIELDS).split(" ").filter(k => source[k] !== undefined).map(k => [k, source[k]]));
}
export const sessionId = token => crypto.createHash("sha256").update(`${token.uid}:${token.auth_time}`).digest("hex");
export const otpHash = (id, otp) => crypto.createHash("sha256").update(`${id}:${otp}`).digest("hex");
const id = value => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const str = (max, min = 0) => value => typeof value === "string" && value.length <= max && value.trim().length >= min;
const email = value => str(254, 3)(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const recoveryIdentifier = value => email(value) || typeof value === "string" && /^\+?[0-9 ()-]{7,25}$/.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15;
const choice = values => value => typeof value === "string" && values.includes(value);
const integer = max => value => (typeof value === "string" && /^\d+$/.test(value) || typeof value === "number") && Number.isSafeInteger(Number(value)) && Number(value) >= 1 && Number(value) <= max;
const url = value => { if (value === "") return true; try { return str(2048)(value) && ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; } };
const otp = value => typeof value === "string" && /^\d{6}$/.test(value);
const languages = ["en", "es", "hi", "pt", "zh-CN", "fr"];
const cursor = value => { decodeCursor(value); return true; };
const collectionQuery = { limit: integer(100), cursor };
export const validTopicIds = value => Array.isArray(value) && value.length <= 3 && value.every(id) && new Set(value.map(item => item.toLowerCase())).size === value.length;
const topicSlug = value => str(80, 1)(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const topicQuery = { limit: integer(50), cursor };
const circleText = (max, min) => value => str(max, min)(value) && !/[<>\u0000-\u001f\u007f]/.test(value);
const circleQuery = { limit: integer(50), cursor };
const profile = { displayName: str(50, 1), avatar: url, bio: str(160), location: str(30), website: v => str(100)(v) && url(v), notificationsEnabled: v => typeof v === "boolean" };
const specs = {
  "GET /": {},
  "POST /register": { raw: true, body: { username: v => str(50, 3)(v) && /^\w+$/.test(v), displayName: profile.displayName, avatar: url, email }, required: ["username", "displayName"] },
  "POST /log-session": { raw: true, body: { email } },
  "POST /verify-login-otp": { raw: true, body: { email, otp }, required: ["otp"] },
  "POST /logout": { raw: true },
  "POST /forgot-password": { public: true, body: { email: recoveryIdentifier }, required: ["email"] },
  "GET /loggedinuser": { query: { email } },
  "PATCH /userupdate/:email": { params: { email }, body: profile },
  "GET /user-plan/:email": { params: { email } },
  "POST /create-order": { body: { email, plan: choice(["bronze", "silver", "gold"]) }, required: ["plan"] },
  "POST /verify-payment": { body: { email, plan: choice(["bronze", "silver", "gold"]), razorpay_order_id: v => typeof v === "string" && /^order_[A-Za-z0-9]+$/.test(v), razorpay_payment_id: v => typeof v === "string" && /^pay_[A-Za-z0-9]+$/.test(v), razorpay_signature: v => typeof v === "string" && /^[a-f\d]{64}$/i.test(v) }, required: ["razorpay_order_id", "razorpay_payment_id", "razorpay_signature"] },
  "POST /request-language-change": { body: { email, targetLanguage: choice(languages) }, required: ["targetLanguage"] },
  "POST /verify-language-change": { body: { email, targetLanguage: choice(languages), otp }, required: ["otp", "targetLanguage"] },
  "POST /generate-audio-otp": { body: { email } },
  "POST /post": { body: { author: id, content: str(200, 1), image: url, audio: url, audioDuration: v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 300, audioOtp: v => v === "" || otp(v), topicIds: validTopicIds, circleId: id }, required: ["content"] },
  "GET /post": { public: true, query: collectionQuery },
  "GET /post/:id": { public: true, params: { id } },
  "DELETE /post/:id": { params: { id }, body: { userId: id } },
  "POST /like/:tweetid": { params: { tweetid: id }, body: { userId: id } },
  "POST /retweet/:tweetid": { params: { tweetid: id }, body: { userId: id } },
  "POST /bookmark/:tweetid": { params: { tweetid: id }, body: { userId: id } },
  "PUT /bookmarks/:id": { params: { id } },
  "DELETE /bookmarks/:id": { params: { id } },
  "DELETE /bookmarks": {},
  "GET /feed": { public: true, optionalAuth: true, query: { ...collectionQuery, page: integer(100000), userId: id, type: choice(["foryou", "following"]), mode: choice(["foryou", "following", "topics", "circles"]) } },
  "POST /post/:id/reply": { params: { id }, body: { author: id, content: str(200, 1) }, required: ["content"] },
  "GET /post/:id/replies": { public: true, params: { id }, query: collectionQuery },
  "GET /users/:username": { public: true, params: { username: str(50, 1) } },
  "GET /users/:username/posts": { public: true, params: { username: str(50, 1) }, query: collectionQuery },
  "GET /users/:username/followers": { public: true, params: { username: str(50, 1) }, query: collectionQuery },
  "GET /users/:username/following": { public: true, params: { username: str(50, 1) }, query: collectionQuery },
  "GET /users/:username/replies": { public: true, params: { username: str(50, 1) }, query: collectionQuery },
  "POST /follow/:id": { params: { id }, body: { userId: id } },
  "DELETE /follow/:id": { params: { id }, body: { userId: id } },
  "GET /bookmarks/:userId": { params: { userId: id }, query: collectionQuery },
  "GET /search": { public: true, query: { q: str(100) } },
  "GET /trending": { public: true },
  "GET /topics": { public: true, optionalAuth: true, query: { ...topicQuery, q: str(80) } },
  "GET /me/topics": { query: topicQuery },
  "GET /topics/:slug": { public: true, optionalAuth: true, params: { slug: topicSlug } },
  "GET /topics/:slug/feed": { public: true, params: { slug: topicSlug }, query: topicQuery },
  "PUT /topics/:id/follow": { params: { id } },
  "DELETE /topics/:id/follow": { params: { id } },
  "GET /circles": { public: true, optionalAuth: true, query: { ...circleQuery, q: str(80) } },
  "POST /circles": { body: { name: circleText(80, 3), description: circleText(300, 3), relatedTopicIds: validTopicIds }, required: ["name", "description"] },
  "GET /me/circles": { query: circleQuery },
  "GET /circles/:slug": { public: true, optionalAuth: true, params: { slug: topicSlug } },
  "GET /circles/:slug/feed": { public: true, params: { slug: topicSlug }, query: circleQuery },
  "GET /circles/:slug/members": { public: true, params: { slug: topicSlug }, query: circleQuery },
  "PUT /circles/:id/membership": { params: { id } },
  "DELETE /circles/:id/membership": { params: { id } },
  "GET /notifications": { query: { ...collectionQuery, type: choice(["all", "mentions"]) } },
  "PATCH /notifications/:id/read": { params: { id } },
  "PATCH /notifications/read": {},
  "GET /suggested-users": { public: true, query: { userId: id } },
  "GET /conversations/:userId": { params: { userId: id }, query: collectionQuery },
  "POST /conversations": { body: { senderId: id, receiverId: id }, required: ["receiverId"] },
  "GET /conversations/:id/messages": { params: { id }, query: { ...collectionQuery, before: v => str(40)(v) && !Number.isNaN(Date.parse(v)) } },
  "POST /conversations/:id/messages": { params: { id }, body: { senderId: id, content: str(1000, 1) }, required: ["content"] },
  "PATCH /conversations/:id/read": { params: { id }, body: { userId: id } },
  "GET /unread-count/:userId": { params: { userId: id } },
  "POST /media-upload": { query: { kind: choice(["image","audio"]) } },
};
function validateObject(value, rules = {}, required = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(400, "INVALID_INPUT", "Expected an object");
  for (const key of Object.keys(value)) if (!Object.hasOwn(rules, key) || !rules[key](value[key])) fail(400, "INVALID_INPUT", `Unsupported or invalid field: ${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(400, "INVALID_INPUT", `Required field: ${key}`);
}
export function validateRequest(key, req) {
  const spec = specs[key];
  if (!spec) throw new Error(`Missing security contract for ${key}`);
  validateObject(req.params || {}, spec.params);
  validateObject(req.query || {}, spec.query);
  validateObject(req.body || {}, spec.body, spec.required);
  return spec;
}
export function boundary(key, dependencies) {
  return async (req, res, next) => {
    try {
      const { verifyToken, User, LoginSession, Conversation } = dependencies;
      const spec = validateRequest(key, req); // Before ANY database lookup.
      if (key === "GET /feed" && req.query.mode && req.query.type && req.query.mode !== req.query.type) {
        fail(400, "FEED_MODE_CONFLICT", "Conflicting feed mode and legacy type parameters");
      }
      const effectiveFeedMode = key === "GET /feed" ? (req.query.mode || req.query.type || "foryou") : null;
      const isPersonalizedFeed = effectiveFeedMode && ["following", "topics", "circles"].includes(effectiveFeedMode);
      const personalized = isPersonalizedFeed || key === "GET /suggested-users" && req.query.userId;
      if (spec.public && !personalized && (!spec.optionalAuth || !req.headers.authorization) || key === "GET /") return next();
      const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || "");
      if (!match) fail(401, "AUTH_REQUIRED", "Please sign in");
      let token;
      try { token = await verifyToken(match[1]); } catch (verifyErr) {
        console.error("[auth] verifyToken failed:", verifyErr?.message || verifyErr?.code || verifyErr);
        fail(401, "INVALID_TOKEN", "Your session has expired. Please sign in again");
      }
      if (!token?.uid || !email(token.email) || !Number.isSafeInteger(token.auth_time)) fail(401, "INVALID_TOKEN", "Invalid sign-in credentials");
      req.identity = token;
      // Email is only a checked compatibility hint, never an account selector.
      for (const value of [req.body?.email, req.query.email, req.params.email]) if (value !== undefined && value.toLowerCase() !== token.email.toLowerCase()) fail(403, "FORBIDDEN", "Account access denied");
      if (spec.raw) return next();
      const user = await resolveUser(User, token);
      if (!user) fail(404, "PROFILE_REQUIRED", "Complete account registration to continue");
      req.principal = user;
      const ownId = String(user._id);
      for (const value of [req.body?.userId, req.body?.author, req.body?.senderId, req.params.userId, req.query.userId]) if (value !== undefined && value !== ownId) fail(403, "FORBIDDEN", "Account access denied");
      const session = await LoginSession.findById(sessionId(token));
      if (!session || session.status !== "verified" || session.expiresAt <= new Date()) fail(403, "OTP_REQUIRED", "Complete login verification to continue");
      req.body ||= {};
      if (spec.body?.userId) req.body.userId = ownId;
      if (spec.body?.author) req.body.author = ownId;
      if (spec.body?.senderId) req.body.senderId = ownId;
      if (spec.body?.email) req.body.email = user.email;
      if (key.includes("/conversations/:id/")) {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) fail(404, "NOT_FOUND", "Conversation not found");
        if (!conversation.participants.map(String).includes(ownId)) fail(403, "FORBIDDEN", "Conversation access denied");
      }
      next();
    } catch (err) { next(err); }
  };
}
export async function resolveUser(User, token) {
  let user = await User.findOne({ firebaseUid: token.uid });
  if (user) return user;
  const legacy = await User.findOne({ email: token.email });
  if (!legacy) return null;
  if (legacy.firebaseUid) fail(403, "IDENTITY_CONFLICT", "Account identity requires support");
  if (!token.email_verified) fail(403, "VERIFY_EMAIL_REQUIRED", "Verify your email before linking your existing account");
  user = await User.findOneAndUpdate({ _id: legacy._id, firebaseUid: { $exists: false } }, { $set: { firebaseUid: token.uid } }, { new: true, runValidators: true });
  if (!user) fail(409, "IDENTITY_CONFLICT", "Account identity changed. Please sign in again");
  return user;
}
const diagnosticErrorNames = new Set([
  "Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError",
  "MongoServerError", "MongoNetworkError", "MongoServerSelectionError",
  "CastError", "ValidationError",
]);
function safeErrorDiagnostic(err, req) {
  const name = diagnosticErrorNames.has(err?.name) ? err.name : "Error";
  const rawCode = err?.code;
  const code = typeof rawCode === "number" && Number.isInteger(rawCode) && rawCode >= 0 && rawCode <= 999999
    ? String(rawCode)
    : typeof rawCode === "string" && /^(?:E[A-Z0-9_]{1,31}|ERR_[A-Z0-9_]{1,31})$/.test(rawCode) ? rawCode : rawCode == null ? undefined : "[redacted]";
  // A matched route is a template (for example /post/:id); the request URL may
  // contain private identifiers or query values and must never enter the log.
  const route = req.route?.path;
  const path = typeof route === "string" && /^\/[a-zA-Z0-9_/:*.-]*$/.test(route) ? route : "/[unmatched]";
  const method = typeof req.method === "string" && /^[A-Z]{2,10}$/.test(req.method) ? req.method : "UNKNOWN";
  // Never log the raw message or stack header: either may contain request data,
  // credentials, URLs, or provider diagnostics. Keep only source locations.
  const stack = typeof err?.stack === "string" ? err.stack.split("\n").slice(1, 13).map(line => {
    const frame = line.match(/(?:^|[\\/])([a-zA-Z0-9._-]+\.(?:[cm]?js|tsx?)):(\d{1,6}):(\d{1,6})(?:\)|$)/);
    return frame ? `${frame[1]}:${frame[2]}:${frame[3]}` : null;
  }).filter(Boolean) : [];
  return { event: "unexpected_request_failure", method, path, name, ...(code === undefined ? {} : { code }), message: "Unexpected server error", stack };
}
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status || (err.type === "entity.too.large" ? 413 : err.type === "entity.parse.failed" ? 400 : err.code === 11000 ? 409 : 500);
  if (status === 500 && !(err instanceof HttpError) && (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "production" && process.env.TWILLER_DEPLOYMENT_STAGE === "staging")) {
    console.error(JSON.stringify(safeErrorDiagnostic(err, req)));
  }
  res.status(status).json({ error: err instanceof HttpError ? err.message : status === 400 ? "Invalid request" : status === 409 ? "Record conflict" : "Request could not be completed", code: err instanceof HttpError ? err.code : "REQUEST_FAILED" });
}
