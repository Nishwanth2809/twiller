import mongoose from "mongoose";
import { userView } from "../security.js";
import Topic, { TOPIC_FIELDS, topicView } from "./topic.js";
import Circle, { CIRCLE_FIELDS, circleView } from "./circle.js";
const TweetSchema = mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String, required: true },
  likes: { type: Number, default: 0 },
  retweets: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  retweetedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  image: { type: String, default: null },
  audio: { type: String, default: null },
  timestamp: { type: Date, default: Date.now },
  // Reply support
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Tweet", default: null },
  deletedAt: { type: Date, default: null },
  topics: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: Topic.modelName }], default: [], validate: value => value.length <= 3 && new Set(value.map(String)).size === value.length },
  circle: { type: mongoose.Schema.Types.ObjectId, ref: Circle.modelName, default: null },
});

// Serialize the API representation, never incidental model internals.
TweetSchema.set("toJSON", {
  transform(_document, value) {
    const fields = ["_id", "author", "content", "likes", "retweets", "comments", "likedBy", "retweetedBy", "image", "audio", "timestamp", "parentId"];
    const result = Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
    if (value.deletedAt) { result.content = "This post was deleted."; result.image = null; result.audio = null; result.deleted = true; }
    if (typeof result.audio === "string" && result.audio.startsWith("data:")) { result.audio = null; result.mediaUnavailable = true; }
    if (result.author?.username !== undefined) result.author = userView(result.author);
    result.topics = value.deletedAt ? [] : (value.topics || []).filter(topic => topic?.slug && topic.status === "active").map(topicView);
    result.circle = value.deletedAt || !value.circle?.slug || value.circle.status !== "active" ? null : circleView(value.circle);
    return result;
  },
});
TweetSchema.index({ timestamp: -1, _id: -1 });
TweetSchema.index({ author: 1, parentId: 1, timestamp: -1, _id: -1 });
TweetSchema.index({ parentId: 1, timestamp: 1, _id: 1 });
TweetSchema.index({ topics: 1, parentId: 1, deletedAt: 1, timestamp: -1, _id: -1 });
TweetSchema.index({ circle: 1, parentId: 1, deletedAt: 1, timestamp: -1, _id: -1 });
// Keep every existing post read/reaction response consistent without exposing raw topic internals.
for (const operation of ["find", "findOne", "findOneAndUpdate"]) TweetSchema.pre(operation, function () {
  this.populate({ path: "topics", select: TOPIC_FIELDS, match: { status: "active" } });
  this.populate({ path: "circle", select: CIRCLE_FIELDS, match: { status: "active" } });
});

export default mongoose.model("Tweet", TweetSchema);
