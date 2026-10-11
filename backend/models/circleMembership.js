import mongoose from "mongoose";
const schema = new mongoose.Schema({
  circle: { type: mongoose.Schema.Types.ObjectId, ref: "Circle", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["owner", "member"], required: true },
  joinedAt: { type: Date, default: Date.now, required: true },
});
schema.index({ circle: 1, user: 1 }, { unique: true });
schema.index({ user: 1, joinedAt: -1, _id: -1 });
schema.index({ circle: 1, joinedAt: -1, _id: -1 });
export default mongoose.model("CircleMembership", schema);
