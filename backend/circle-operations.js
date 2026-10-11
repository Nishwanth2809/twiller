import Circle, { CIRCLE_FIELDS, circleView } from "./models/circle.js";
import CircleMembership from "./models/circleMembership.js";
import Topic, { TOPIC_FIELDS } from "./models/topic.js";
import Tweet from "./models/tweet.js";
import { fail, PUBLIC_USER_FIELDS, userView } from "./security.js";
import { cursorFilter, pageResult, literalSearch } from "./pagination.js";
import { transaction } from "./quota.js";
import { rateLimit } from "./challenges.js";

const circlePopulate = [
  { path: "owner", select: PUBLIC_USER_FIELDS },
  { path: "relatedTopics", select: TOPIC_FIELDS, match: { status: "active" } },
];
const slugFor = name => name.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/g, "");

async function circleSummaries(circles, owner) {
  const ids = circles.map(circle => circle._id);
  const memberships = owner && ids.length ? await CircleMembership.find({ circle: { $in: ids }, user: owner }).select("circle role").lean() : [];
  const roles = new Map(memberships.map(row => [String(row.circle), row.role]));
  return Promise.all(circles.map(async circle => ({ ...circleView(circle), membershipRole: roles.get(String(circle._id)) || null,
    memberCount: await CircleMembership.countDocuments({ circle: circle._id }) })));
}
async function activeCircle(slug) {
  const circle = await Circle.findOne({ slug, status: "active", visibility: "public" }).select(CIRCLE_FIELDS).populate(circlePopulate);
  if (!circle) fail(404, "CIRCLE_NOT_FOUND", "Circle is unavailable");
  return circle;
}
export async function createCircle(owner, input) {
  const slug = slugFor(input.name);
  if (slug.length < 3) fail(400, "INVALID_CIRCLE", "Choose a Circle name with at least three letters or numbers");
  const ids = input.relatedTopicIds || [];
  try {
    const created = await transaction(async session => {
      if (ids.length && await Topic.countDocuments({ _id: { $in: ids }, status: "active" }).session(session) !== ids.length)
        fail(400, "INVALID_TOPICS", "One or more related topics are unavailable");
      const [circle] = await Circle.create([{ name: input.name.trim(), slug, description: input.description.trim(), owner,
        visibility: "public", status: "active", relatedTopics: ids }], { session });
      await CircleMembership.create([{ circle: circle._id, user: owner, role: "owner" }], { session });
      return circle;
    });
    await created.populate(circlePopulate);
    return (await circleSummaries([created], owner))[0];
  } catch (error) {
    if (error.code === 11000) fail(409, "CIRCLE_SLUG_TAKEN", "A Circle with this name already exists");
    throw error;
  }
}
export async function setCircleMembership(owner, circleId, joining) {
  const circle = await Circle.findById(circleId).select("_id owner status visibility");
  if (!circle) fail(404, "CIRCLE_NOT_FOUND", "Circle is unavailable");
  if (!joining && String(circle.owner) === String(owner)) fail(403, "OWNER_CANNOT_LEAVE", "The Circle owner cannot leave");
  if (joining && (circle.status !== "active" || circle.visibility !== "public")) fail(404, "CIRCLE_NOT_FOUND", "Circle is unavailable");
  if (joining) {
    try {
      await CircleMembership.updateOne({ circle: circleId, user: owner }, { $setOnInsert: { role: "member", joinedAt: new Date() } },
        { upsert: true, runValidators: true });
    } catch (error) { if (error.code !== 11000) throw error; }
  } else await CircleMembership.deleteOne({ circle: circleId, user: owner });
  return { circleId: String(circleId), membershipRole: joining ? "member" : null,
    memberCount: await CircleMembership.countDocuments({ circle: circleId }) };
}
export function registerCircleRoutes(app, protect) {
  app.get("/circles", protect("GET /circles"), async (req, res) => {
    const limit = Number(req.query.limit || 20);
    const filter = { status: "active", visibility: "public", ...cursorFilter(req.query.cursor, "createdAt") };
    if (req.query.q?.trim()) filter.name = literalSearch(req.query.q);
    const rows = await Circle.find(filter).select(CIRCLE_FIELDS).sort({ createdAt: -1, _id: -1 }).limit(limit + 1)
      .populate(circlePopulate).maxTimeMS(2000);
    const page = pageResult(rows, limit, "createdAt");
    res.json({ circles: await circleSummaries(page.items, req.principal?._id), hasMore: page.hasMore, nextCursor: page.nextCursor });
  });
  app.post("/circles", protect("POST /circles"), async (req, res) => {
    await rateLimit(`circle-create:${req.principal._id}`, 5, 86400000);
    res.status(201).json(await createCircle(req.principal._id, req.body));
  });
  app.get("/me/circles", protect("GET /me/circles"), async (req, res) => {
    const limit = Number(req.query.limit || 20);
    const rows = await CircleMembership.find({ user: req.principal._id, ...cursorFilter(req.query.cursor, "joinedAt") })
      .sort({ joinedAt: -1, _id: -1 }).limit(limit + 1)
      .populate({ path: "circle", select: CIRCLE_FIELDS, populate: circlePopulate });
    const page = pageResult(rows, limit, "joinedAt");
    res.json({ circles: await circleSummaries(page.items.map(row => row.circle).filter(Boolean), req.principal._id),
      hasMore: page.hasMore, nextCursor: page.nextCursor });
  });
  app.get("/circles/:slug", protect("GET /circles/:slug"), async (req, res) =>
    res.json((await circleSummaries([await activeCircle(req.params.slug)], req.principal?._id))[0]));
  app.get("/circles/:slug/feed", protect("GET /circles/:slug/feed"), async (req, res) => {
    const circle = await activeCircle(req.params.slug);
    const limit = Number(req.query.limit || 20);
    const rows = await Tweet.find({ circle: circle._id, parentId: null, deletedAt: null, ...cursorFilter(req.query.cursor, "timestamp") })
      .sort({ timestamp: -1, _id: -1 }).limit(limit + 1).populate("author", PUBLIC_USER_FIELDS);
    const page = pageResult(rows, limit);
    res.json({ tweets: page.items, hasMore: page.hasMore, nextCursor: page.nextCursor });
  });
  app.get("/circles/:slug/members", protect("GET /circles/:slug/members"), async (req, res) => {
    const circle = await activeCircle(req.params.slug);
    const limit = Number(req.query.limit || 20);
    const rows = await CircleMembership.find({ circle: circle._id, ...cursorFilter(req.query.cursor, "joinedAt") })
      .sort({ joinedAt: -1, _id: -1 }).limit(limit + 1).populate("user", PUBLIC_USER_FIELDS);
    const page = pageResult(rows, limit, "joinedAt");
    res.json({ members: page.items.filter(row => row.user).map(row => ({ user: userView(row.user), role: row.role, joinedAt: row.joinedAt })),
      hasMore: page.hasMore, nextCursor: page.nextCursor });
  });
  app.put("/circles/:id/membership", protect("PUT /circles/:id/membership"), async (req, res) =>
    res.json(await setCircleMembership(req.principal._id, req.params.id, true)));
  app.delete("/circles/:id/membership", protect("DELETE /circles/:id/membership"), async (req, res) =>
    res.json(await setCircleMembership(req.principal._id, req.params.id, false)));
}
