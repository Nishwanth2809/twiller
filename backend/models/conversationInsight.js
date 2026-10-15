import mongoose from "mongoose";

const schema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Tweet", required: true },
  scopeKey: { type: String, default: "public", required: true },
  status: { type: String, enum: ["generating", "completed", "failed"], default: "generating", required: true },
  leaseExpiresAt: { type: Date, default: null },
  fingerprint: { type: String, default: null },
  overview: { type: String, default: null, maxlength: 500 },
  keyPoints: {
    type: [{
      statement: { type: String, required: true, maxlength: 300 },
      sourcePostIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tweet", required: true }],
    }],
    default: [],
  },
  perspectives: {
    type: [{
      viewpoint: { type: String, required: true, maxlength: 300 },
      sourcePostIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tweet", required: true }],
    }],
    default: [],
  },
  analyzedReplyCount: { type: Number, default: 0 },
  latestReplyTimestamp: { type: Date, default: null },
  generatedAt: { type: Date, default: null },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  model: { type: String, default: "mock-v1" },
  lastGenerationErrorCode: { type: String, default: null },
}, { timestamps: true });

schema.index({ post: 1, scopeKey: 1 }, { unique: true });
schema.index({ status: 1, leaseExpiresAt: 1 });

export default mongoose.models.ConversationInsight || mongoose.model("ConversationInsight", schema);
