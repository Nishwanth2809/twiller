import mongoose from "mongoose";

const schema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["follow", "like", "repost", "reply", "mention"], required: true },
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Tweet", default: null },
  readAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ recipient: 1, createdAt: -1, _id: -1 });
schema.index({ recipient: 1, readAt: 1, createdAt: -1 });

export default mongoose.models.Notification || mongoose.model("Notification", schema);
