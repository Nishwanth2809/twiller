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

dotenv.config();
dns.setDefaultResultOrder("ipv4first");

// ─── Firebase Admin Init ──────────────────────────────────────────────────────
import { createRequire } from "module";
const require = createRequire(import.meta.url);

if (!admin.apps.length) {
  try {
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
    console.log("✅ Firebase Admin initialized");
  } catch (err) {
    console.warn("⚠️ Firebase Admin init failed:", err.message);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// ─── Razorpay Instance ────────────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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

const emailProvider = process.env.RESEND_API_KEY ? "resend" : "gmail-smtp";
console.log(`📧 Email provider: ${emailProvider}`);

async function sendTwillerEmail({ to, subject, html }) {
  const from = process.env.EMAIL_FROM || `"Twiller" <${process.env.EMAIL_USER}>`;

  if (process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend email failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  return transporter.sendMail({
    from,
    to,
    subject,
    html,
  });
}

// ─── Plan Config ──────────────────────────────────────────────────────────────
const PLANS = {
  free:   { limit: 1,        price: 0,      label: "Free Plan" },
  bronze: { limit: 3,        price: 10000,  label: "Bronze Plan" }, // paise
  silver: { limit: 5,        price: 30000,  label: "Silver Plan" },
  gold:   { limit: Infinity, price: 100000, label: "Gold Plan" },
};

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

  await sendTwillerEmail({
    to: email,
    subject: `🎉 Twiller ${planConfig.label} - Payment Confirmed`,
    html,
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.send("Twiller backend is running successfully");
});

// ─── Login Session & OTP Helper ──────────────────────────────────────────────
app.post("/log-session", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).send({ error: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "User not found" });

    const userAgentStr = req.headers["user-agent"] || "";
    const parser = new UAParser(userAgentStr);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();

    const browserName = browser.name || "Unknown";
    const osName = os.name || "Unknown";
    const deviceType = device.type || "desktop"; 
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "Unknown";

    const sessionInfo = {
      browser: browserName,
      os: osName,
      device: deviceType,
      ip: ip,
      timestamp: new Date(),
      status: "pending"
    };

    if (deviceType === "mobile") {
      const now = new Date();
      const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      const hours = istTime.getUTCHours();
      if (hours < 10 || hours >= 13) {
        sessionInfo.status = "blocked";
        user.loginHistory.push(sessionInfo);
        await user.save();
        return res.status(403).send({ error: "Mobile login is only allowed between 10:00 AM and 1:00 PM IST." });
      }
    }

    if (browserName.includes("Chrome") && !browserName.includes("Edge")) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.loginOtp = otp;
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);
      user.loginOtpExpiresAt = expiresAt;
      
      sessionInfo.status = "otp_pending";
      user.loginHistory.push(sessionInfo);
      await user.save();

      const html = `
        <h3>Login Verification</h3>
        <p>Your OTP for login is: <strong style="font-size: 24px;">${otp}</strong></p>
        <p>This OTP will expire in 10 minutes.</p>
      `;
      try {
        await sendTwillerEmail({
          to: user.email,
          subject: "🔐 Twiller - Login Verification OTP",
          html,
        });
      } catch (err) {
        console.error("OTP Email failed:", err.message);
      }

      return res.status(200).send({ requiresOtp: true });
    } else {
      sessionInfo.status = "success";
      user.loginHistory.push(sessionInfo);
      await user.save();
      return res.status(200).send({ requiresOtp: false });
    }
  } catch (error) {
    console.error("log-session error:", error);
    return res.status(500).send({ error: error.message });
  }
});

app.post("/verify-login-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "User not found" });

    if (user.loginOtp !== otp) {
      return res.status(400).send({ error: "Invalid OTP" });
    }
    if (new Date() > user.loginOtpExpiresAt) {
      return res.status(400).send({ error: "OTP has expired" });
    }

    user.loginOtp = null;
    user.loginOtpExpiresAt = null;
    
    for (let i = user.loginHistory.length - 1; i >= 0; i--) {
      if (user.loginHistory[i].status === "otp_pending") {
        user.loginHistory[i].status = "success";
        break;
      }
    }
    
    await user.save();
    return res.status(200).send({ success: true });
  } catch (error) {
    console.error("verify-login-otp error:", error);
    return res.status(500).send({ error: error.message });
  }
});

// Register
app.post("/register", async (req, res) => {
  try {
    const existinguser = await User.findOne({ email: req.body.email });
    if (existinguser) {
      return res.status(200).send(existinguser);
    }
    const newUser = new User(req.body);
    await newUser.save();
    return res.status(201).send(newUser);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

// Logged in user
app.get("/loggedinuser", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).send({ error: "Email required" });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "User not found" });
    return res.status(200).send(user);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

// Update profile
app.patch("/userupdate/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const updated = await User.findOneAndUpdate(
      { email },
      { $set: req.body },
      { new: true, upsert: false }
    );
    return res.status(200).send(updated);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

// Get user plan + tweet count
app.get("/user-plan/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).send({ error: "User not found" });

    // Reset tweet count if plan expired
    if (user.planExpiresAt && new Date() > user.planExpiresAt) {
      user.plan = "free";
      user.tweetCount = 0;
      user.planExpiresAt = null;
      await user.save();
    }

    const planLimit = PLANS[user.plan]?.limit ?? 1;
    return res.status(200).send({
      plan: user.plan,
      tweetCount: user.tweetCount,
      planLimit: planLimit === Infinity ? -1 : planLimit,
      planExpiresAt: user.planExpiresAt,
    });
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

// Create Razorpay Order (time-gated)
app.post("/create-order", async (req, res) => {
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

    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "User not found" });

    const amount = PLANS[plan].price;
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `twiller_${Date.now()}`,
      notes: { plan, userId: user._id.toString() },
    });

    // Save pending subscription record
    const sub = new Subscription({
      userId: user._id,
      plan,
      razorpayOrderId: order.id,
      amount,
      status: "created",
    });
    await sub.save();

    return res.status(200).send({ orderId: order.id, amount, currency: "INR" });
  } catch (error) {
    console.error("create-order error:", error);
    return res.status(500).send({ error: error.message });
  }
});

// Verify Payment & Upgrade Plan
app.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, email } = req.body;

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).send({ error: "Invalid payment signature" });
    }

    // Upgrade user plan
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const user = await User.findOneAndUpdate(
      { email },
      {
        plan,
        tweetCount: 0, // reset count on upgrade
        planExpiresAt: expiresAt,
        planActivatedAt: new Date(),
      },
      { new: true }
    );

    if (!user) return res.status(404).send({ error: "User not found" });

    // Update subscription record
    await Subscription.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        razorpayPaymentId: razorpay_payment_id,
        status: "paid",
        paidAt: new Date(),
        invoiceSentAt: new Date(),
      }
    );

    // Send invoice email
    try {
      await sendInvoiceEmail(
        user.email,
        user.displayName,
        plan,
        razorpay_payment_id,
        PLANS[plan].price
      );
    } catch (emailErr) {
      console.error("Email send failed:", emailErr.message);
    }

    return res.status(200).send({
      success: true,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt,
    });
  } catch (error) {
    console.error("verify-payment error:", error);
    return res.status(500).send({ error: error.message });
  }
});

// ─── Password Generator (alpha only) ─────────────────────────────────────────
function generateAlphaPassword(length = 12) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// ─── Check if same calendar day (IST) ────────────────────────────────────────
function isSameDayIST(date1, date2) {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const d1 = new Date(date1.getTime() + istOffset);
  const d2 = new Date(date2.getTime() + istOffset);
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  );
}

// Forgot Password
app.post("/forgot-password", async (req, res) => {
  try {
    const { email: emailOrPhone } = req.body;
    if (!emailOrPhone) return res.status(400).send({ error: "Email or phone number is required" });

    const query = emailOrPhone.includes("@") 
      ? { email: emailOrPhone } 
      : { phoneNumber: emailOrPhone };

    const user = await User.findOne(query);
    if (!user) return res.status(404).send({ error: "No account found with this email or phone number" });

    // Check daily limit
    if (user.lastPasswordReset && isSameDayIST(user.lastPasswordReset, new Date())) {
      return res.status(429).send({
        error: "You can use this option only one time per day.",
        rateLimited: true,
      });
    }

    // Generate alpha-only password
    const newPassword = generateAlphaPassword(12);

    // Update password in Firebase Auth
    try {
      try {
        const firebaseUser = await admin.auth().getUserByEmail(user.email);
        await admin.auth().updateUser(firebaseUser.uid, { password: newPassword });
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          // Sync missing user to Firebase
          await admin.auth().createUser({
            email: user.email,
            password: newPassword,
            displayName: user.displayName,
          });
        } else {
          throw err;
        }
      }
    } catch (fbErr) {
      console.error("Firebase password update failed:", fbErr.message);
      return res.status(500).send({ error: "Failed to update password. Please try again." });
    }

    // Update last reset timestamp
    user.lastPasswordReset = new Date();
    await user.save();

    // Send email with new password
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
        .password-box { background: #f3f4f6; border: 2px dashed #1d9bf0; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; }
        .password-box .password { font-size: 28px; font-weight: bold; letter-spacing: 3px; color: #1d9bf0; font-family: monospace; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; color: #9ca3af; font-size: 13px; }
        .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin: 16px 0; color: #92400e; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Password Reset</h1>
          <p>Twiller Account Recovery</p>
        </div>
        <div class="body">
          <p style="font-size:16px;">Hi <strong>${user.displayName}</strong>,</p>
          <p>We received a password reset request for your account. Here is your new generated password:</p>
          <div class="password-box">
            <p style="margin:0 0 8px; color:#6b7280; font-size:14px;">Your New Password</p>
            <div class="password">${newPassword}</div>
          </div>
          <div class="warning">
            ⚠️ <strong>Important:</strong> Please use this password to log in and consider changing it from your profile settings. This reset can only be used once per day.
          </div>
          <p style="color:#6b7280; font-size:14px;">If you didn't request this reset, please secure your account immediately.</p>
        </div>
        <div class="footer">
          <p>© 2024 Twiller · This is an automated email. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
    `;

    try {
      await sendTwillerEmail({
        to: user.email,
        subject: "🔐 Twiller - Your Password Has Been Reset",
        html,
      });

      return res.status(200).send({
        success: true,
        message: "A new password has been sent to your email address.",
        generatedPassword: newPassword,
      });
    } catch (emailErr) {
      console.error("Password reset email failed:", emailErr.message);
      return res.status(200).send({
        success: true,
        emailDeliveryFailed: true,
        message: "Password reset completed, but the email could not be delivered. Use the password shown on this page.",
        generatedPassword: newPassword,
      });
    }
  } catch (error) {
    console.error("forgot-password error:", error);
    return res.status(500).send({ error: error.message });
  }
});

// Post a tweet (with plan limit check)
app.post("/post", async (req, res) => {
  try {
    const { author } = req.body;

    // Fetch author to check plan
    const user = await User.findById(author);
    if (!user) return res.status(404).send({ error: "User not found" });

    // Reset if plan expired
    if (user.planExpiresAt && new Date() > user.planExpiresAt) {
      user.plan = "free";
      user.tweetCount = 0;
      user.planExpiresAt = null;
      await user.save();
    }

    const planLimit = PLANS[user.plan]?.limit ?? 1;
    if (planLimit !== Infinity && user.tweetCount >= planLimit) {
      return res.status(403).send({
        error: `Tweet limit reached for your ${user.plan} plan. Please upgrade to post more.`,
        limitReached: true,
        plan: user.plan,
      });
    }

    const tweet = new Tweet(req.body);
    await tweet.save();

    // Increment tweet count
    user.tweetCount = (user.tweetCount || 0) + 1;
    await user.save();

    return res.status(201).send(tweet);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

// Get all tweets
app.get("/post", async (req, res) => {
  try {
    const tweet = await Tweet.find().sort({ timestamp: -1 }).populate("author");
    return res.status(200).send(tweet);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

// Like tweet
app.post("/like/:tweetid", async (req, res) => {
  try {
    const { userId } = req.body;
    const tweet = await Tweet.findById(req.params.tweetid);
    if (!tweet.likedBy.includes(userId)) {
      tweet.likes += 1;
      tweet.likedBy.push(userId);
      await tweet.save();
    }
    res.send(tweet);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

// Retweet
app.post("/retweet/:tweetid", async (req, res) => {
  try {
    const { userId } = req.body;
    const tweet = await Tweet.findById(req.params.tweetid);
    if (!tweet.retweetedBy.includes(userId)) {
      tweet.retweets += 1;
      tweet.retweetedBy.push(userId);
      await tweet.save();
    }
    res.send(tweet);
  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

// ─── Server ───────────────────────────────────────────────────────────────────
const port = process.env.PORT || 5000;
const url = process.env.MONOGDB_URL;

mongoose
  .connect(url)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });
