import mongoose from "mongoose";

const UserSchema = mongoose.Schema({
  firebaseUid: { type: String },
  username: { type: String, required: true, lowercase: true, minlength: 3, maxlength: 50, match: /^[a-z0-9_]+$/ },
  displayName: { type: String, required: true },
  avatar: { type: String, default: "" },
  email: { type: String, required: true, unique: true },
  bio: { type: String, default: "" },
  location: { type: String, default: "" },
  website: { type: String, default: "" },
  phoneNumber: { type: String, default: "" },
  joinedDate: { type: Date, default: Date.now },
  // Role & Account Status
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  accountStatus: {
    type: String,
    enum: ["active", "suspended", "frozen", "deleted"],
    default: "active",
  },
  // Subscription fields
  plan: {
    type: String,
    enum: ["free", "bronze", "silver", "gold"],
    default: "free",
  },
  tweetCount: { type: Number, default: 0 },
  quotaStartsAt: Date,
  quotaResetsAt: Date,
  planExpiresAt: { type: Date, default: null },
  planActivatedAt: { type: Date, default: null },
  lastPasswordReset: { type: Date, default: null },
  loginOtp: { type: String, default: null },
  loginOtpExpiresAt: { type: Date, default: null },
  audioOtp: { type: String, default: null },
  audioOtpExpiresAt: { type: Date, default: null },
  loginHistory: [
    {
      browser: String,
      os: String,
      device: String,
      ip: String,
      timestamp: { type: Date, default: Date.now },
      status: String,
    }
  ],
  notificationsEnabled: { type: Boolean, default: false },
  language: { type: String, default: 'en' },
  languageOtp: { type: String, default: null },
  languageOtpExpiresAt: { type: Date, default: null },
  // Social graph
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  // Bookmarks
  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tweet" }],
});

UserSchema.index({ firebaseUid: 1 }, { unique: true, partialFilterExpression: { firebaseUid: { $type: "string" } } });
// Created only through audited local readiness or an approved future migration.
UserSchema.index({ username: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export default mongoose.model("User", UserSchema);
