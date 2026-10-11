import mongoose from "mongoose";

const schema = new mongoose.Schema({
  _id: String,
  uid: { type: String, required: true },
  status: { type: String, enum: ["pending", "verified", "revoked"], default: "pending" },
  otpHash: { type: String, select: false },
  otpExpiresAt: Date,
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  loginInfo: { browser: String, os: String, device: String, ip: String },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("LoginSession", schema);
