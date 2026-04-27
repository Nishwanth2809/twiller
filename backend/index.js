import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import crypto from "crypto";
import nodemailer from "nodemailer";
import User from "./models/user.js";
import Tweet from "./models/tweet.js";
import Subscription from "./models/subscription.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// ─── Razorpay Instance ────────────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ─── Nodemailer Transporter ───────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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

  await transporter.sendMail({
    from: `"Twiller" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `🎉 Twiller ${planConfig.label} - Payment Confirmed`,
    html,
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.send("Twiller backend is running successfully");
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