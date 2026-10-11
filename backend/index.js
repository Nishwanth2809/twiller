import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import crypto from "crypto";
import dns from "dns";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { UAParser } from "ua-parser-js";
import User from "./models/user.js";
import Tweet from "./models/tweet.js";
import Subscription from "./models/subscription.js";
import Conversation from "./models/conversation.js";
import Message from "./models/message.js";
import Notification from "./models/notification.js";
import { markRead } from "./notification-operations.js";
import { registerTopicRoutes } from "./topic-operations.js";
import { registerCircleRoutes } from "./circle-operations.js";
import LoginSession from "./models/loginSession.js";
import { boundary, errorHandler, fail, resolveUser, sessionId, otpHash, userView, PUBLIC_USER_FIELDS } from "./security.js";
import { verifyPurchase } from "./payment.js";
import { deliverEmail } from "./mail.js";
import { quotaState, transaction } from "./quota.js";
import { createPost, deletePost, follow } from "./post-operations.js";
import { toggleReaction, toggleBookmark } from "./reactions.js";
import { normalizeHandle, pairKey } from "./handles.js";
import { cursorFilter, pageResult, literalSearch } from "./pagination.js";
import { rateLimit, issueChallenge, checkChallenge, consumeChallenge } from "./challenges.js";
import { corsOrigins, firebaseAuthEmulatorConfig, rejectOrigin, validateConfiguration } from "./config.js";
import { prepareIndexes } from "./readiness.js";
import { storeMedia, mediaDirectory, attachMedia, AUDIO_MAX } from "./media.js";
import Media from "./models/media.js";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.NODE_ENV !== "test") dotenv.config({ quiet: true });
dns.setDefaultResultOrder("ipv4first");

// ─── Firebase Admin Init ──────────────────────────────────────────────────────
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const localAuthEmulator = firebaseAuthEmulatorConfig(process.env);

if (!admin.apps.length) {
  try {
    if (localAuthEmulator) {
      admin.initializeApp({ projectId: localAuthEmulator.projectId });
      console.log("✅ Firebase Auth Emulator enabled for local acceptance");
    } else {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      };
    } else {
      serviceAccount = require("./serviceAccountKey.json");
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    }
    console.log("✅ Firebase Admin initialized");
  } catch (err) {
    console.warn("Firebase Admin initialization failed; check configuration");
  }
}

export const app = express();
export const securityDependencies = { verifyToken: token => admin.auth().verifyIdToken(token), User, LoginSession, Conversation };
export const paymentDependencies = { Subscription, User, mongoose, razorpay: null, secret: process.env.RAZORPAY_KEY_SECRET, plans: null };
export const mailDependencies = { send: options => sendTwillerEmail(options), resetLink: email => admin.auth().generatePasswordResetLink(email) };

// Browser-origin policy is separate from Firebase authentication.
app.use(rejectOrigin);
app.use(cors({origin:(value,callback)=>callback(null,!value||corsOrigins().has(value)),credentials:false,allowedHeaders:["Content-Type","Authorization"],exposedHeaders:["X-Has-More","X-Next-Cursor"]}));
app.use(express.json({limit:"256kb"}));
app.use(express.urlencoded({limit:"256kb",extended:false}));

// ─── Razorpay Instance ────────────────────────────────────────────────────────
const razorpay = process.env.RAZORPAY_KEY_ID ? new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
}) : null;
paymentDependencies.razorpay = razorpay;

// ─── Nodemailer Transporter ───────────────────────────────────────────────────
function lookupIpv4Only(hostname, options, callback) {
  dns.lookup(hostname, { ...options, family: 4, all: false }, callback);
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for 465, false for other ports
  family: 4,
  lookup: lookupIpv4Only,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

async function sendTwillerEmail(mailOptions) {
  return deliverEmail(mailOptions, {
    appsScriptUrl: process.env.APPS_SCRIPT_URL,
    sendSmtp: options => transporter.sendMail(options),
  });
}

// ─── Plan Config ──────────────────────────────────────────────────────────────
const PLANS = {
  free:   { limit: 1,        price: 0,      label: "Free Plan" },
  bronze: { limit: 3,        price: 10000,  label: "Bronze Plan" }, // paise
  silver: { limit: 5,        price: 30000,  label: "Silver Plan" },
  gold:   { limit: Infinity, price: 100000, label: "Gold Plan" },
};

paymentDependencies.plans = PLANS;

// ─── IST Time Gate Helper ─────────────────────────────────────────────────────
function isPaymentWindowOpen() {
  const now = new Date();
  // Convert UTC to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  // 10:00 AM = 600 mins, 11:00 AM = 660 mins
  return totalMinutes >= 600 && totalMinutes < 660;
}

// ─── Invoice Email Helper ─────────────────────────────────────────────────────
async function sendInvoiceEmail(email, displayName, plan, paymentId, amount) {
  const planConfig = PLANS[plan];
  const limitText = planConfig.limit === Infinity ? "Unlimited" : `${planConfig.limit} tweets/month`;
  const amountInRupees = (amount / 100).toFixed(2);
  const now = new Date();
  const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const dateStr = istTime.toISOString().replace("T", " ").substring(0, 19) + " IST";

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
      .container { max-width: 600px; margin: auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #1d9bf0, #7c3aed); padding: 30px; text-align: center; color: white; }
      .header h1 { margin: 0; font-size: 28px; }
      .header p { margin: 8px 0 0; opacity: 0.9; }
      .body { padding: 30px; }
      .plan-badge { display: inline-block; padding: 6px 18px; border-radius: 20px; font-weight: bold; font-size: 14px;
        background: ${plan === "gold" ? "#fbbf24" : plan === "silver" ? "#94a3b8" : "#cd7f32"}; color: #fff; }
      .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      .details-table td { padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
      .details-table td:first-child { color: #6b7280; font-weight: 500; }
      .details-table td:last-child { font-weight: 600; color: #111827; text-align: right; }
      .total-row td { font-size: 18px; color: #1d9bf0 !important; border-bottom: none !important; }
      .footer { background: #f9fafb; padding: 20px; text-align: center; color: #9ca3af; font-size: 13px; }
      .footer a { color: #1d9bf0; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>🐦 Twiller Premium</h1>
        <p>Payment Confirmation & Invoice</p>
      </div>
      <div class="body">
        <p style="font-size:16px;">Hi <strong>${displayName}</strong>,</p>
        <p>Thank you for subscribing! Your payment was successful. Here are your subscription details:</p>
        <p><span class="plan-badge">${planConfig.label}</span></p>
        <table class="details-table">
          <tr><td>Invoice Date</td><td>${dateStr}</td></tr>
          <tr><td>Payment ID</td><td>${paymentId}</td></tr>
          <tr><td>Plan</td><td>${planConfig.label}</td></tr>
          <tr><td>Tweet Limit</td><td>${limitText}</td></tr>
          <tr><td>Validity</td><td>30 days</td></tr>
          <tr class="total-row"><td>Amount Paid</td><td>₹${amountInRupees}</td></tr>
        </table>
        <p style="color:#6b7280; font-size:14px;">Your plan is now active. Enjoy tweeting on Twiller!</p>
      </div>
      <div class="footer">
        <p>© 2024 Twiller · <a href="#">Terms</a> · <a href="#">Privacy</a></p>
        <p>This is an automated invoice email. Please do not reply.</p>
      </div>
    </div>
  </body>
  </html>
  `;

  await mailDependencies.send({
    from: `"Twiller" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `🎉 Twiller ${planConfig.label} - Payment Confirmed`,
    html,
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/", boundary("GET /", securityDependencies), (req, res) => {
  res.send("Twiller backend is running successfully");
});

// Firebase authenticates the credential; Mongo persists application verification.
app.post("/log-session", boundary("POST /log-session", securityDependencies), async (req, res) => {
  const token = req.identity;
  const user = await resolveUser(User, token);
  if (!user) fail(404, "PROFILE_REQUIRED", "Complete account registration to continue");
  const parser = new UAParser(req.headers["user-agent"] || "");
  const loginInfo = { browser: parser.getBrowser().name || "Unknown", os: parser.getOS().name || "Unknown", device: parser.getDevice().type || "desktop", ip: req.ip };
  const key = sessionId(token);

  // Google OAuth is its own strong authentication — skip OTP and auto-verify
  const provider = token.firebase?.sign_in_provider;
  const isOAuthProvider = provider === "google.com" || provider === "apple.com" || provider === "github.com" ||
    Boolean(token.firebase?.identities?.["google.com"]) ||
    Boolean(token.firebase?.identities?.["apple.com"]) ||
    Boolean(token.firebase?.identities?.["github.com"]);
  if (isOAuthProvider) {
    try {
      await LoginSession.findOneAndUpdate(
        { _id: key },
        {
          $set: { uid: token.uid, status: "verified", loginInfo, expiresAt: new Date(Date.now() + 24 * 3600000) },
          $unset: { otpHash: 1, otpExpiresAt: 1, attempts: 1 }
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      if (err.code === 11000) {
        // Race condition: doc was just created — verify it's in a usable state
        const current = await LoginSession.findById(key);
        if (!current || current.status === "revoked") fail(401, "SESSION_REVOKED", "Please sign in again");
      } else throw err;
    }
    try { await User.updateOne({ firebaseUid: token.uid }, { $push: { loginHistory: { ...loginInfo, timestamp: new Date(), status: "success" } } }); } catch { /* non-critical */ }
    return res.json({ requiresOtp: false });
  }

  if (parser.getDevice().type === "mobile") {
    const hour = new Date(Date.now() + 5.5 * 3600000).getUTCHours();
    if (hour < 10 || hour >= 13) fail(403, "LOGIN_WINDOW", "Mobile login is only allowed between 10:00 AM and 1:00 PM IST.");
  }
  let session = await LoginSession.findById(key);
  if (session?.status === "revoked") fail(401, "SESSION_REVOKED", "Please sign in again");
  if (session?.status === "verified" && session.expiresAt > new Date()) return res.json({ requiresOtp: false });
  if (session?.status === "pending" && session.otpExpiresAt > new Date()) return res.json({ requiresOtp: true });
  await rateLimit(`login:${token.uid}`);
  await rateLimit(`login-ip:${req.ip}`,30);
  const otp = crypto.randomInt(100000, 1000000).toString();
  const hash = otpHash(key, otp);
  try {
    session = await LoginSession.findOneAndUpdate(
      { _id: key },
      {
        $set: {
          uid: token.uid,
          status: "pending",
          attempts: 0,
          otpHash: hash,
          otpExpiresAt: new Date(Date.now() + 600000),
          expiresAt: new Date(Date.now() + 24 * 3600000),
          loginInfo
        }
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Race: another request created the doc — return OTP required
    return res.json({ requiresOtp: true });
  }
  try {
    await mailDependencies.send({ to: user.email, subject: "Twiller - Login verification", html: `<p>Your login code is <strong>${otp}</strong>. It expires in 10 minutes.</p>` });
  } catch {
    await LoginSession.deleteOne({ _id: key, otpHash: hash });
    fail(503, "DELIVERY_FAILED", "We could not send your login code. Please retry");
  }
  res.json({ requiresOtp: true });
});
app.post("/verify-login-otp", boundary("POST /verify-login-otp", securityDependencies), async (req, res) => {
  const key = sessionId(req.identity);
  const result = await LoginSession.findOneAndUpdate({ _id: key, uid: req.identity.uid, status: "pending", attempts:{$lt:5}, otpHash: otpHash(key, req.body.otp), otpExpiresAt: { $gt: new Date() }, expiresAt: { $gt: new Date() } }, { $set: { status: "verified" }, $unset: { otpHash: 1, otpExpiresAt: 1 } }, { new: true });
  if(!result) {
    await LoginSession.updateOne({_id:key,status:"pending",attempts:{$lt:5}},{$inc:{attempts:1}});
    fail(400,"INVALID_OTP","Invalid, expired or exhausted login code");
  }
  try { await User.updateOne({ firebaseUid: req.identity.uid }, { $push: { loginHistory: { ...result.loginInfo?.toObject?.() || result.loginInfo, timestamp: new Date(), status: "success" } } }); }
  catch { console.error("Login history update failed"); }
  res.json({ success: true });
});
app.post("/logout", boundary("POST /logout", securityDependencies), async (req, res) => {
  await LoginSession.findOneAndUpdate({ _id: sessionId(req.identity) }, { $set: { uid: req.identity.uid, status: "revoked", expiresAt: new Date(Date.now() + 24 * 3600000) }, $unset: { otpHash: 1, otpExpiresAt: 1 } }, { upsert: true });
  res.json({ success: true });
});
app.post("/register", boundary("POST /register", securityDependencies), async (req, res) => {
  const token = req.identity;
  let existing = await resolveUser(User, token);
  if (existing) {
    // Sync Google profile picture & display name for existing users that have none
    const updates = {};
    if (!existing.avatar && token.picture) updates.avatar = token.picture;
    if (!existing.displayName && token.name) updates.displayName = token.name;
    if (Object.keys(updates).length) {
      existing = await User.findOneAndUpdate({ _id: existing._id }, { $set: updates }, { new: true });
    }
    return res.status(200).json(userView(existing));
  }
  const username=normalizeHandle(req.body.username);
  if(await User.findOne({username:new RegExp("^"+username+"$","i")}))fail(409,"USERNAME_UNAVAILABLE","Choose another username");
  // Allow Google/Firebase picture URL as avatar — token.picture is already verified by Firebase
  const avatarUrl = req.body.avatar || token.picture || "";
  if(avatarUrl && avatarUrl !== token.picture) fail(400,"INVALID_MEDIA","Use a verified avatar upload after registration");
  let user;
  try {
    user = await User.create({ firebaseUid: token.uid, email: token.email, username: normalizeHandle(req.body.username), displayName: req.body.displayName, avatar: avatarUrl });
  } catch (err) {
    if (err.code !== 11000) throw err;
    user = await User.findOne({ firebaseUid: token.uid });
    if (!user) fail(409,"USERNAME_UNAVAILABLE","Choose another username");
  }
  res.status(201).json(userView(user));
});
app.get("/loggedinuser", boundary("GET /loggedinuser", securityDependencies), async (req, res) => res.json({...userView(req.principal, true),...quotaState(req.principal)}));
app.patch("/userupdate/:email", boundary("PATCH /userupdate/:email", securityDependencies), async (req,res)=>{
  const updated=await transaction(async session=>{
    if(req.body.avatar&&req.body.avatar!==req.principal.avatar)await attachMedia(req.body.avatar,"image",req.principal._id,session);
    return User.findOneAndUpdate({_id:req.principal._id},{$set:req.body},{new:true,runValidators:true,session});
  });
  if(!updated)fail(404,"NOT_FOUND","Account not found");
  res.json({...userView(updated,true),...quotaState(updated)});
});

// Get user plan + tweet count
app.get("/user-plan/:email", boundary("GET /user-plan/:email", securityDependencies), async (req, res) => {
  res.json(quotaState(req.principal));
});

// Create Razorpay Order (time-gated)
app.post("/create-order", boundary("POST /create-order", securityDependencies), async (req, res) => {
  try {
    if (!isPaymentWindowOpen()) {
      return res.status(403).send({
        error: "Payments are only accepted between 10:00 AM and 11:00 AM IST.",
      });
    }

    const { plan, email } = req.body;
    if (!plan || !["bronze", "silver", "gold"].includes(plan)) {
      return res.status(400).send({ error: "Invalid plan" });
    }

    const user = await User.findById(req.principal._id);
    if (!user) return res.status(404).send({ error: "User not found" });

    const amount = PLANS[plan].price;
    if (!razorpay) fail(503, "PAYMENT_UNAVAILABLE", "Payments are unavailable");
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `twiller_${Date.now()}`,
      notes: { plan, userId: user._id.toString() },
    });

    // Save pending subscription record
    if (!razorpay) fail(503, "PAYMENT_UNAVAILABLE", "Payments are unavailable");
    const sub = new Subscription({
      userId: user._id,
      plan,
      razorpayOrderId: order.id,
      amount,
      status: "created",
      currency: "INR",
    });
    await sub.save();

    return res.status(200).send({ orderId: order.id, amount, currency: "INR" });
  } catch (error) {
    console.error("create-order failed");
    return res.status(500).send({ error: "Request could not be completed" });
  }
});

// Verify provider settlement and apply exactly once with the purchase/user transaction.
app.post("/verify-payment", boundary("POST /verify-payment", securityDependencies), async (req,res)=>{
  const result=await verifyPurchase(req.body,req.principal,paymentDependencies);
  const claim=await Subscription.findOneAndUpdate({razorpayOrderId:req.body.razorpay_order_id,status:"paid",invoiceSentAt:null,$or:[{invoiceStatus:{$in:["pending","failed"]}},{invoiceStatus:{$exists:false}},{invoiceStatus:"sending",invoiceAttemptAt:{$lt:new Date(Date.now()-60000)}}]},{$set:{invoiceStatus:"sending",invoiceAttemptAt:new Date()}},{new:true});
  if(claim) {
    try {
      await sendInvoiceEmail(req.principal.email,req.principal.displayName,result.plan,req.body.razorpay_payment_id,PLANS[result.plan].price);
      await Subscription.updateOne({_id:claim._id,invoiceAttemptAt:claim.invoiceAttemptAt},{$set:{invoiceStatus:"sent",invoiceSentAt:new Date()}});
    } catch {
      await Subscription.updateOne({_id:claim._id,invoiceAttemptAt:claim.invoiceAttemptAt},{$set:{invoiceStatus:"failed"}});
    }
  }
  const purchase=await Subscription.findOne({razorpayOrderId:req.body.razorpay_order_id});
  res.json({...result,invoiceDelivery:purchase.invoiceStatus||"pending"});
});
// Firebase's hosted reset action validates expiring, single-use ownership proof.
// Requesting a link never changes a password or creates a Firebase account.
app.post("/forgot-password", boundary("POST /forgot-password", securityDependencies), async (req, res) => {
  await rateLimit(`recovery-ip:${req.ip}`,10);
  await rateLimit(`recovery-locator:${req.body.email.toLowerCase()}`,3);
  try {
    let recoveryEmail = req.body.email;
    if (!recoveryEmail.includes("@")) {
      const account = await User.findOne({ phoneNumber: recoveryEmail }).select("email");
      recoveryEmail = account?.email;
    }
    if (recoveryEmail) {
    const link = await mailDependencies.resetLink(recoveryEmail);
    await mailDependencies.send({ to: recoveryEmail, subject: "Twiller - Reset your password", html: `<p>Use this link to choose a new password:</p><a href="${link.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">Reset password</a>` });
    }
  } catch (err) {
    if (err.code !== "auth/user-not-found") fail(503, "RECOVERY_UNAVAILABLE", "We could not send a reset link. Please retry later");
  }
  res.json({ success: true, message: "If the account supports password sign-in, a reset link has been sent. Your password changes only after you use that link." });
});

app.post("/request-language-change", boundary("POST /request-language-change", securityDependencies), async (req, res) => {
  await rateLimit(`language-ip:${req.ip}`,30);
  const result=await issueChallenge(req.principal,"language",req.body.targetLanguage,otp=>mailDependencies.send({to:req.principal.email,subject:"Twiller - Language verification",html:`<p>Your code is <strong>${otp}</strong>. It expires in ten minutes.</p>`}));
  res.json({method:"email",...result});
});

app.post("/verify-language-change", boundary("POST /verify-language-change", securityDependencies), async (req, res) => {
  const proof=await checkChallenge(req.principal._id,"language",req.body.targetLanguage,req.body.otp);
  await transaction(async session=>{
    await consumeChallenge(proof,session);
    await User.updateOne({_id:req.principal._id},{$set:{language:req.body.targetLanguage}},{session,runValidators:true});
  });
  res.json({success:true,language:req.body.targetLanguage});
});

// Generate Audio OTP
app.post("/generate-audio-otp", boundary("POST /generate-audio-otp", securityDependencies), async (req, res) => {
  await rateLimit(`audio-ip:${req.ip}`,30);
  const result=await issueChallenge(req.principal,"audio","audio",otp=>mailDependencies.send({to:req.principal.email,subject:"Twiller - Audio verification",html:`<p>Your code is <strong>${otp}</strong>. It expires in ten minutes.</p>`}));
  res.json({success:true,...result,delivery:"email"});
});

// Post a tweet (with plan limit check)
app.post("/post", boundary("POST /post", securityDependencies), async (req, res) => {
  res.status(201).json(await createPost(req.principal._id,req.body));
});

// Get all tweets
app.get("/post", boundary("GET /post", securityDependencies), async (req,res)=>{
  const limit=Number(req.query.limit||50);
  const rows=await Tweet.find({...cursorFilter(req.query.cursor,"timestamp")}).sort({timestamp:-1,_id:-1}).limit(limit+1).populate("author",PUBLIC_USER_FIELDS);
  const result=pageResult(rows,limit,"timestamp");
  res.set({"X-Has-More":String(result.hasMore),"X-Next-Cursor":result.nextCursor||""}).json(result.items);
});

// Like / Unlike tweet (toggle)
app.post("/like/:tweetid",boundary("POST /like/:tweetid",securityDependencies),async(req,res)=>{
  res.json(await toggleReaction(req.params.tweetid,req.principal._id,"like"));
});

// Retweet / Unretweet (toggle)
app.post("/retweet/:tweetid",boundary("POST /retweet/:tweetid",securityDependencies),async(req,res)=>{
  res.json(await toggleReaction(req.params.tweetid,req.principal._id,"retweet"));
});

// ─── Additional Routes ────────────────────────────────────────────────────────

// Get single tweet by ID
app.get("/post/:id", boundary("GET /post/:id", securityDependencies), async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id).populate("author", PUBLIC_USER_FIELDS);
    if (!tweet) return res.status(404).send({ error: "Tweet not found" });
    return res.status(200).send(tweet);
  } catch (error) {
    return res.status(400).send({ error: "Request could not be completed" });
  }
});

// Delete tweet (only author can delete)
app.delete("/post/:id", boundary("DELETE /post/:id", securityDependencies), async (req, res) => {
  res.json(await deletePost(req.principal._id,req.params.id));
});

// Get tweet feed with pagination (for-you: all, following: filtered)
app.get("/feed", boundary("GET /feed", securityDependencies), async (req,res)=>{
  const limit=Number(req.query.limit||20);
  const query={parentId:null,deletedAt:null,...cursorFilter(req.query.cursor,"timestamp")};
  if(req.query.type==="following")query.author={$in:[...req.principal.following,req.principal._id]};
  const rows=await Tweet.find(query).sort({timestamp:-1,_id:-1}).skip(req.query.cursor?0:(Number(req.query.page||1)-1)*limit).limit(limit+1).populate("author",PUBLIC_USER_FIELDS);
  const result=pageResult(rows,limit);
  res.json({tweets:result.items,hasMore:result.hasMore,nextCursor:result.nextCursor,page:Number(req.query.page||1)});
});

// Create a reply to a tweet
app.post("/post/:id/reply", boundary("POST /post/:id/reply", securityDependencies), async (req, res) => {
  res.status(201).json(await createPost(req.principal._id,req.body,req.params.id));
});

// Get replies for a tweet
app.get("/post/:id/replies", boundary("GET /post/:id/replies", securityDependencies), async (req,res)=>{
  const limit=Number(req.query.limit||50);
  const rows=await Tweet.find({parentId:req.params.id,...cursorFilter(req.query.cursor,"timestamp",false)}).sort({timestamp:1,_id:1}).limit(limit+1).populate("author",PUBLIC_USER_FIELDS);
  const result=pageResult(rows,limit,"timestamp");
  res.set({"X-Has-More":String(result.hasMore),"X-Next-Cursor":result.nextCursor||""}).json(result.items);
});

// Get user by username
app.get("/users/:username", boundary("GET /users/:username", securityDependencies), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select(PUBLIC_USER_FIELDS);
    if (!user) return res.status(404).send({ error: "User not found" });
    return res.status(200).send(user);
  } catch (error) {
    return res.status(400).send({ error: "Request could not be completed" });
  }
});

// Get tweets by user
app.get("/users/:username/posts", boundary("GET /users/:username/posts", securityDependencies), async (req,res)=>{
  const user=await User.findOne({username:new RegExp("^"+req.params.username.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$","i")});
  if(!user)fail(404,"NOT_FOUND","Account not found");
  const limit=Number(req.query.limit||50);
  const rows=await Tweet.find({author:user._id,parentId:null,...cursorFilter(req.query.cursor,"timestamp")}).sort({timestamp:-1,_id:-1}).limit(limit+1).populate("author",PUBLIC_USER_FIELDS);
  const result=pageResult(rows,limit,"timestamp");
  res.set({"X-Has-More":String(result.hasMore),"X-Next-Cursor":result.nextCursor||""}).json(result.items);
});

async function listProfileUsers(req, res, field) {
  const profile=await User.findOne({username:new RegExp("^"+req.params.username.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$","i")}).select(field);
  if(!profile)fail(404,"NOT_FOUND","Account not found");
  const limit=Number(req.query.limit||50);
  const rows=await User.find({_id:{$in:profile[field]},...cursorFilter(req.query.cursor,"joinedDate")}).select(PUBLIC_USER_FIELDS).sort({joinedDate:-1,_id:-1}).limit(limit+1);
  const result=pageResult(rows,limit,"joinedDate");
  res.json({items:result.items,hasMore:result.hasMore,nextCursor:result.nextCursor});
}
app.get("/users/:username/followers",boundary("GET /users/:username/followers",securityDependencies),(req,res)=>listProfileUsers(req,res,"followers"));
app.get("/users/:username/following",boundary("GET /users/:username/following",securityDependencies),(req,res)=>listProfileUsers(req,res,"following"));
app.get("/users/:username/replies",boundary("GET /users/:username/replies",securityDependencies),async(req,res)=>{
  const profile=await User.findOne({username:new RegExp("^"+req.params.username.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$","i")}).select("_id");
  if(!profile)fail(404,"NOT_FOUND","Account not found");
  const limit=Number(req.query.limit||50);
  const rows=await Tweet.find({author:profile._id,parentId:{$ne:null},deletedAt:null,...cursorFilter(req.query.cursor,"timestamp")}).sort({timestamp:-1,_id:-1}).limit(limit+1).populate("author",PUBLIC_USER_FIELDS);
  const result=pageResult(rows,limit,"timestamp");
  res.json({items:result.items,hasMore:result.hasMore,nextCursor:result.nextCursor});
});

// Follow a user
app.post("/follow/:id", boundary("POST /follow/:id", securityDependencies), async (req, res) => {
  res.json(await follow(req.principal._id,req.params.id));
});

// Unfollow a user
app.delete("/follow/:id", boundary("DELETE /follow/:id", securityDependencies), async (req, res) => {
  res.json(await follow(req.principal._id,req.params.id,true));
});

app.get("/notifications",boundary("GET /notifications",securityDependencies),async(req,res)=>{
  const limit=Number(req.query.limit||50);
  const query={recipient:req.principal._id,...(req.query.type==="mentions"?{type:"mention"}:{}),...cursorFilter(req.query.cursor,"createdAt")};
  const [rows,unreadCount]=await Promise.all([
    Notification.find(query).sort({createdAt:-1,_id:-1}).limit(limit+1).populate("actor",PUBLIC_USER_FIELDS).populate({path:"post",select:"_id content timestamp deletedAt author",populate:{path:"author",select:PUBLIC_USER_FIELDS}}),
    Notification.countDocuments({recipient:req.principal._id,readAt:null,...(req.query.type==="mentions"?{type:"mention"}:{})}),
  ]);
  const result=pageResult(rows,limit,"createdAt");
  res.json({...result,unreadCount});
});
app.patch("/notifications/:id/read",boundary("PATCH /notifications/:id/read",securityDependencies),async(req,res)=>{
  const notification=await markRead(req.principal._id,req.params.id);
  res.json({notification});
});
app.patch("/notifications/read",boundary("PATCH /notifications/read",securityDependencies),async(req,res)=>{
  const result=await Notification.updateMany({recipient:req.principal._id,readAt:null},{$set:{readAt:new Date()}});
  res.json({success:true,updated:result.modifiedCount});
});

// Bookmark / Unbookmark tweet (toggle)
app.post("/bookmark/:tweetid",boundary("POST /bookmark/:tweetid",securityDependencies),async(req,res)=>{
  res.json(await toggleBookmark(req.params.tweetid,req.principal._id));
});

// Idempotent bookmark semantics for retry-safe frontend actions.
app.put("/bookmarks/:id",boundary("PUT /bookmarks/:id",securityDependencies),async(req,res)=>{
  const post=await Tweet.findOne({_id:req.params.id,deletedAt:null});
  if(!post)return res.status(404).json({error:"Post not found"});
  const updated=await User.findOneAndUpdate({_id:req.principal._id},{$addToSet:{bookmarks:post._id}},{new:true});
  res.json({success:true,bookmarked:true,bookmarks:updated.bookmarks});
});
app.delete("/bookmarks/:id",boundary("DELETE /bookmarks/:id",securityDependencies),async(req,res)=>{
  await User.updateOne({_id:req.principal._id},{$pull:{bookmarks:req.params.id}});
  res.json({success:true,bookmarked:false});
});
app.delete("/bookmarks",boundary("DELETE /bookmarks",securityDependencies),async(req,res)=>{
  await User.updateOne({_id:req.principal._id},{$set:{bookmarks:[]}});
  res.json({success:true,cleared:true});
});

// Get user's bookmarks
app.get("/bookmarks/:userId", boundary("GET /bookmarks/:userId", securityDependencies), async (req,res)=>{
  const limit=Number(req.query.limit||50);
  const rows=await Tweet.find({_id:{$in:req.principal.bookmarks},deletedAt:null,...cursorFilter(req.query.cursor,"timestamp")}).sort({timestamp:-1,_id:-1}).limit(limit+1).populate("author",PUBLIC_USER_FIELDS);
  const result=pageResult(rows,limit,"timestamp");
  res.set({"X-Has-More":String(result.hasMore),"X-Next-Cursor":result.nextCursor||""}).json(result.items);
});

// Search (users and tweets)
app.get("/search", boundary("GET /search", securityDependencies), async (req, res) => {
  const q=(req.query.q||"").trim();
  if(!q)return res.json({users:[],tweets:[]});
  const regex=literalSearch(q);
  const [users,tweets]=await Promise.all([
    User.find({$or:[{username:regex},{displayName:regex}]}).select(PUBLIC_USER_FIELDS).sort({username:1,_id:1}).limit(10).maxTimeMS(2000),
    Tweet.find({content:regex,parentId:null,deletedAt:null}).sort({timestamp:-1,_id:-1}).limit(20).maxTimeMS(2000).populate("author",PUBLIC_USER_FIELDS)
  ]);
  res.json({users,tweets});
});

app.get("/trending",boundary("GET /trending",securityDependencies),async(_req,res)=>{
  const recent=await Tweet.find({parentId:null,deletedAt:null,timestamp:{$gte:new Date(Date.now()-7*24*60*60*1000)}}).select("content").sort({timestamp:-1}).limit(500).lean();
  const counts=new Map();
  for(const post of recent)for(const match of String(post.content||"").matchAll(/(?:^|\s)#([\p{L}\p{N}_]{2,30})/gu)){
    const tag=match[1].toLocaleLowerCase();counts.set(tag,(counts.get(tag)||0)+1);
  }
  res.json([...counts].map(([tag,count])=>({tag,count})).sort((a,b)=>b.count-a.count||a.tag.localeCompare(b.tag)).slice(0,10));
});

// Get suggested users (exclude current user, sorted by follower count)
app.get("/suggested-users", boundary("GET /suggested-users", securityDependencies), async (req, res) => {
  try {
    const userId = req.principal ? String(req.principal._id) : undefined;
    let excludeIds = [];
    if (userId) {
      const currentUser = await User.findById(userId).select("following");
      if (currentUser) {
        excludeIds = [...currentUser.following.map((id) => id.toString()), userId];
      }
    }

    const users = await User.find({
      _id: { $nin: excludeIds },
    })
      .select("username displayName avatar bio followers")
      .limit(5);

    return res.status(200).send(users);
  } catch (error) {
    return res.status(400).send({ error: "Request could not be completed" });
  }
});

// ─── DM Routes ───────────────────────────────────────────────────────────────

// GET /conversations/:userId — list all conversations for a user
app.get("/conversations/:userId", boundary("GET /conversations/:userId", securityDependencies), async (req,res)=>{
  const limit=Number(req.query.limit||50);
  const rows=await Conversation.find({participants:req.principal._id,...cursorFilter(req.query.cursor,"lastMessageAt")}).populate("participants",PUBLIC_USER_FIELDS).populate("lastMessageSender",PUBLIC_USER_FIELDS).sort({lastMessageAt:-1,_id:-1}).limit(limit+1);
  const result=pageResult(rows,limit,"lastMessageAt");
  res.set({"X-Has-More":String(result.hasMore),"X-Next-Cursor":result.nextCursor||""}).json(result.items);
});

// POST /conversations — find existing or create new conversation
app.post("/conversations", boundary("POST /conversations", securityDependencies), async (req, res) => {
  const sender=req.principal._id,receiver=req.body.receiverId;
  const key=pairKey([sender,receiver]);
  if(!await User.exists({_id:receiver}))fail(404,"NOT_FOUND","Recipient not found");
  let conversation=await Conversation.findOne({pairKey:key});
  if(!conversation) {
    const legacy=await Conversation.findOne({participants:{$all:[sender,receiver],$size:2}});
    if(legacy)fail(409,"CONVERSATION_RECONCILIATION","This conversation needs migration before messaging");
    try {conversation=await Conversation.findOneAndUpdate({pairKey:key},{$setOnInsert:{pairKey:key,participants:[sender,receiver].map(String).sort()}},{upsert:true,new:true,runValidators:true});}
    catch(error){if(error.code!==11000)throw error;conversation=await Conversation.findOne({pairKey:key});}
  }
  res.json(await conversation.populate("participants",PUBLIC_USER_FIELDS));
});

// GET /conversations/:id/messages — get messages in a conversation
app.get("/conversations/:id/messages", boundary("GET /conversations/:id/messages", securityDependencies), async (req, res) => {
  const limit=Number(req.query.limit||50);
  const query={conversationId:req.params.id,...cursorFilter(req.query.cursor,"createdAt")};
  if(req.query.before&&!req.query.cursor)query.createdAt={$lt:new Date(req.query.before)};
  const rows=await Message.find(query).populate("sender",PUBLIC_USER_FIELDS).sort({createdAt:-1,_id:-1}).limit(limit+1);
  const result=pageResult(rows,limit,"createdAt",true);
  res.json({messages:result.items,hasMore:result.hasMore,nextCursor:result.nextCursor});
});

// POST /conversations/:id/messages — send a message
app.post("/conversations/:id/messages", boundary("POST /conversations/:id/messages", securityDependencies), async (req, res) => {
  const message=await transaction(async session=>{
    const conversation=await Conversation.findById(req.params.id).session(session);
    if(!conversation||!conversation.participants.map(String).includes(String(req.principal._id)))fail(403,"FORBIDDEN","Conversation access denied");
    const [created]=await Message.create([{conversationId:conversation._id,sender:req.principal._id,content:req.body.content.trim()}],{session});
    await Conversation.updateOne({_id:conversation._id},{$set:{lastMessage:created.content.slice(0,100),lastMessageAt:created.createdAt,lastMessageSender:req.principal._id}},{session});
    return created;
  });
  res.status(201).json(await message.populate("sender",PUBLIC_USER_FIELDS));
});

// PATCH /conversations/:id/read — mark messages as read
app.patch("/conversations/:id/read", boundary("PATCH /conversations/:id/read", securityDependencies), async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    await Message.updateMany(
      { conversationId: id, sender: { $ne: userId }, read: false },
      { $set: { read: true } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// GET /unread-count/:userId — total unread messages
app.get("/unread-count/:userId", boundary("GET /unread-count/:userId", securityDependencies), async (req, res) => {
  try {
    const userId = String(req.principal._id);
    const conversations = await Conversation.find({ participants: userId }, "_id");
    const conversationIds = conversations.map((c) => c._id);
    const count = await Message.countDocuments({
      conversationId: { $in: conversationIds },
      sender: { $ne: userId },
      read: false,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: "Failed to get unread count" });
  }
});


// Bounded authenticated binary upload; no arbitrary remote URL fetch or client credentials.
app.post("/media-upload",boundary("POST /media-upload",securityDependencies),express.raw({type:()=>true,limit:AUDIO_MAX}),async(req,res)=>{
  await rateLimit(`upload:${req.principal._id}`,20);
  res.status(201).json(await storeMedia(req.body,req.query.kind,req.principal._id));
});
app.get("/media/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!/^[a-f\d]{24}$/.test(id)) return res.status(404).json({ error: "Not found" });
    const media = await Media.findById(id);
    if (!media || !media.published) return res.status(404).json({ error: "Media unavailable" });
    if (!/^[a-f0-9]{24}\.(jpg|wav|mp3)$/.test(media.filename)) return res.status(404).json({ error: "Media unavailable" });
    // Allow cross-origin image loading from any allowed frontend origin
    const origin = req.headers.origin;
    if (origin && corsOrigins().has(origin)) res.set("Access-Control-Allow-Origin", origin);
    res.set({
      "Content-Type": media.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    res.sendFile(path.join(mediaDirectory(), media.filename));
  } catch (err) { next(err); }
});

registerTopicRoutes(app, key => boundary(key, securityDependencies));
registerCircleRoutes(app, key => boundary(key, securityDependencies));
app.use(errorHandler);
export async function startServer() {
  const config=validateConfiguration();
  if(!admin.apps.length)throw new Error("Firebase Admin configuration is required");
  await mongoose.connect(config.uri, { autoIndex: false });

  // Backfill pairKey on any conversations missing it (one-time migration)
  const { default: Conversation } = await import("./models/conversation.js");
  const missing = await Conversation.find({ pairKey: { $exists: false }, $expr: { $eq: [{ $size: { $ifNull: ["$participants", []] } }, 2] } });
  if (missing.length > 0) {
    console.log(`🔧 Backfilling pairKey on ${missing.length} conversation(s)...`);
    await Promise.all(missing.map(c => {
      c.pairKey = [...c.participants].map(String).sort().join("_");
      return c.save();
    }));
    console.log("✅ pairKey backfill complete");
  }

  await prepareIndexes(config.production);
  const port = process.env.PORT || 5000;
  return app.listen(port, () => {
    const env = config.production ? "production" : "development";
    const db = config.dbType || (config.production ? "Atlas (production)" : "local");
    const services = [
      process.env.RAZORPAY_KEY_ID ? "Razorpay ✓" : "Razorpay ✗",
      (process.env.EMAIL_USER || process.env.APPS_SCRIPT_URL) ? "Email ✓" : "Email ✗",
      process.env.MEDIA_PUBLIC_BASE_URL ? `Media → ${process.env.MEDIA_PUBLIC_BASE_URL}` : "Media (default)",
    ].join(" | ");
    console.log(`🚀 Twiller backend ready  port=${port}  env=${env}  db=${db}`);
    console.log(`   Services: ${services}`);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((err) => {
    console.error("❌ Backend startup failed:", err?.message || err);
    console.error(err?.stack || "");
    process.exitCode = 1;
  });
}
