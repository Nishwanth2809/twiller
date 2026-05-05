import mongoose from "mongoose";

const UserSchema = mongoose.Schema({
  username: { type: String, required: true },
  displayName: { type: String, required: true },
  avatar: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  bio: { type: String, default: "" },
  location: { type: String, default: "" },
  website: { type: String, default: "" },
  phoneNumber: { type: String, default: "" },
  joinedDate: { type: Date, default: Date.now() },
  // Subscription fields
  plan: {
    type: String,
    enum: ["free", "bronze", "silver", "gold"],
    default: "free",
  },
  tweetCount: { type: Number, default: 0 },
  planExpiresAt: { type: Date, default: null },
  planActivatedAt: { type: Date, default: null },
  lastPasswordReset: { type: Date, default: null },
  loginOtp: { type: String, default: null },
  loginOtpExpiresAt: { type: Date, default: null },
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
});

export default mongoose.model("User", UserSchema);
