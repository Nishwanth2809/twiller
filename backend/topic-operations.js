import Topic, { TOPIC_FIELDS, topicView } from "./models/topic.js";
import TopicFollow from "./models/topicFollow.js";
import Tweet from "./models/tweet.js";
import { fail, PUBLIC_USER_FIELDS } from "./security.js";
import { cursorFilter, pageResult, literalSearch } from "./pagination.js";

export async function annotateTopics(topics, owner) {
  const followed = owner ? await TopicFollow.find({ user: owner, topic: { $in: topics.map(topic => topic._id) } }).select("topic").lean() : [];
  const ids = new Set(followed.map(row => String(row.topic)));
  return topics.map(topic => ({ ...topicView(topic), following: ids.has(String(topic._id)) }));
}
export async function activeTopic(slug) {
  const topic = await Topic.findOne({ slug, status: "active" }).select(TOPIC_FIELDS);
  if (!topic) fail(404, "TOPIC_NOT_FOUND", "Topic is unavailable");
  return topic;
}
export async function setTopicFollow(owner, topicId, following) {
  if (following && !await Topic.exists({ _id: topicId, status: "active" })) fail(404, "TOPIC_NOT_FOUND", "Topic is unavailable");
  // Unfollow also removes relationships to disabled/removed topics and remains retry-safe.
  if (!following) await TopicFollow.deleteOne({ user: owner, topic: topicId });
  else {
    try { await TopicFollow.updateOne({ user: owner, topic: topicId }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true, runValidators: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
  }
  return { topicId: String(topicId), following };
}
export function registerTopicRoutes(app, protect) {
  app.get("/topics", protect("GET /topics"), async (req, res) => {
    const limit = Number(req.query.limit || 20);
    const query = { status: "active", ...cursorFilter(req.query.cursor, "createdAt") };
    if (req.query.q?.trim()) query.name = literalSearch(req.query.q);
    const rows = await Topic.find(query).select(TOPIC_FIELDS).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).maxTimeMS(2000);
    const page = pageResult(rows, limit, "createdAt");
    res.json({ topics: await annotateTopics(page.items, req.principal?._id), hasMore: page.hasMore, nextCursor: page.nextCursor });
  });
  app.get("/me/topics", protect("GET /me/topics"), async (req, res) => {
    const limit = Number(req.query.limit || 20);
    const rows = await TopicFollow.find({ user: req.principal._id, ...cursorFilter(req.query.cursor, "createdAt") })
      .sort({ createdAt: -1, _id: -1 }).limit(limit + 1).populate("topic", TOPIC_FIELDS);
    const page = pageResult(rows, limit, "createdAt");
    res.json({ topics: page.items.filter(row => row.topic).map(row => ({ ...topicView(row.topic), following: true })), hasMore: page.hasMore, nextCursor: page.nextCursor });
  });
  app.get("/topics/:slug", protect("GET /topics/:slug"), async (req, res) => {
    const topic = await activeTopic(req.params.slug);
    res.json((await annotateTopics([topic], req.principal?._id))[0]);
  });
  app.get("/topics/:slug/feed", protect("GET /topics/:slug/feed"), async (req, res) => {
    const topic = await activeTopic(req.params.slug);
    const limit = Number(req.query.limit || 20);
    const rows = await Tweet.find({ topics: topic._id, parentId: null, deletedAt: null, ...cursorFilter(req.query.cursor, "timestamp") })
      .sort({ timestamp: -1, _id: -1 }).limit(limit + 1).populate("author", PUBLIC_USER_FIELDS);
    const page = pageResult(rows, limit);
    res.json({ tweets: page.items, hasMore: page.hasMore, nextCursor: page.nextCursor });
  });
  app.put("/topics/:id/follow", protect("PUT /topics/:id/follow"), async (req, res) => res.json(await setTopicFollow(req.principal._id, req.params.id, true)));
  app.delete("/topics/:id/follow", protect("DELETE /topics/:id/follow"), async (req, res) => res.json(await setTopicFollow(req.principal._id, req.params.id, false)));
}
