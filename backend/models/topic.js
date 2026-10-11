import mongoose from "mongoose";

export const TOPIC_FIELDS = "_id slug name description status createdAt updatedAt";
export const topicView = topic => {
  if (!topic) return null;
  const value = topic.toObject ? topic.toObject() : topic;
  return Object.fromEntries(TOPIC_FIELDS.split(" ").filter(key => value[key] !== undefined).map(key => [key, value[key]]));
};
const schema = new mongoose.Schema({
  slug: { type: String, required: true, maxlength: 80, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: "", maxlength: 300 },
  status: { type: String, enum: ["active", "disabled"], default: "active", required: true },
}, { timestamps: true });
schema.index({ slug: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1, _id: -1 });
schema.set("toJSON", { transform: (_document, value) => topicView(value) });
export default mongoose.model("Topic", schema);
