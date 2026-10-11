import mongoose from "mongoose";
import { userView } from "../security.js";
import { topicView } from "./topic.js";

export const CIRCLE_FIELDS = "_id slug name description owner visibility status relatedTopics createdAt updatedAt";
export function circleView(circle) {
  if (!circle) return null;
  const value = circle.toObject ? circle.toObject() : circle;
  const result = Object.fromEntries(CIRCLE_FIELDS.split(" ").filter(key => value[key] !== undefined).map(key => [key, value[key]]));
  result.owner = value.owner?.username ? userView(value.owner) : null;
  result.relatedTopics = (value.relatedTopics || []).filter(topic => topic?.slug && topic.status === "active").map(topicView);
  return result;
}
const schema = new mongoose.Schema({
  slug: { type: String, required: true, maxlength: 80, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  name: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
  description: { type: String, required: true, trim: true, minlength: 3, maxlength: 300 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  visibility: { type: String, enum: ["public"], default: "public", required: true },
  status: { type: String, enum: ["active", "disabled"], default: "active", required: true },
  relatedTopics: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Topic" }], default: [], validate: ids => ids.length <= 3 && new Set(ids.map(String)).size === ids.length },
}, { timestamps: true });
schema.index({ slug: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1, _id: -1 });
schema.index({ owner: 1 });
schema.set("toJSON", { transform: (_document, value) => circleView(value) });
export default mongoose.model("Circle", schema);
