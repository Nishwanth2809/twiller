import mongoose from "mongoose";
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  topic: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", required: true },
  createdAt: { type: Date, default: Date.now, required: true },
});
schema.index({ user: 1, topic: 1 }, { unique: true });
schema.index({ user: 1, createdAt: -1, _id: -1 });
schema.index({ topic: 1 });
export default mongoose.model("TopicFollow", schema);
