import mongoose from "mongoose";

export const FEED_RULE_TYPES = [
  "only_following",
  "hide_topic",
  "hide_media",
  "boost_topic",
  "reduce_topic",
  "prioritize_circle",
];
export const FEED_RULE_DURATIONS = ["one_hour", "today", "seven_days", "until_removed"];

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ruleType: { type: String, required: true, enum: FEED_RULE_TYPES },
  targetType: { type: String, enum: ["topic", "circle", null], default: null },
  target: { type: mongoose.Schema.Types.ObjectId, default: null },
  duration: { type: String, enum: FEED_RULE_DURATIONS, required: true },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ user: 1, createdAt: -1 });
schema.index({ user: 1, expiresAt: 1 });
schema.index({ user: 1, ruleType: 1, targetType: 1, target: 1 }, { unique: true });

export default mongoose.model("FeedRule", schema);
