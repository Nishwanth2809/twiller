import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Circle, { circleView } from "../models/circle.js";
import CircleMembership from "../models/circleMembership.js";
import Tweet from "../models/tweet.js";
import { validateRequest } from "../security.js";

const id = new mongoose.Types.ObjectId().toString();
const req = (params = {}, query = {}, body = {}) => ({ params, query, body });
test("Circle boundary validates inputs before database access and rejects claimed ownership", () => {
  assert.deepEqual(validateRequest("POST /circles", req({}, {}, { name: "AI Builders", description: "Build together", relatedTopicIds: [id] })).required, ["name", "description"]);
  for (const body of [
    { name: "AI Builders", description: "Build together", owner: id },
    { name: "<script>", description: "Build together" },
    { name: "AI Builders", description: "Build together", relatedTopicIds: [id, id] },
    { name: "AI Builders", description: "Build together", relatedTopicIds: ["bad"] },
  ]) assert.throws(() => validateRequest("POST /circles", req({}, {}, body)), { status: 400 });
  assert.throws(() => validateRequest("PUT /circles/:id/membership", req({ id: "bad" })), { status: 400 });
  assert.throws(() => validateRequest("POST /post", req({}, {}, { content: "hi", circleId: "bad" })), { status: 400 });
  assert.throws(() => validateRequest("GET /circles", req({}, { limit: "500" })), { status: 400 });
  assert.throws(() => validateRequest("GET /circles", req({}, { cursor: "bad" })), { status: 400 });
});
test("Circle and membership schemas constrain visibility, roles, and uniqueness indexes", async () => {
  const valid = new Circle({ slug: "ai-builders", name: "AI Builders", description: "Build together", owner: id });
  await valid.validate();
  await assert.rejects(new Circle({ slug: "BAD SLUG", name: "AI Builders", description: "Build together", owner: id }).validate());
  await assert.rejects(new Circle({ slug: "abc", name: "AI Builders", description: "Build together", owner: id, visibility: "private" }).validate());
  await assert.rejects(new Circle({ slug: "abc", name: "AI Builders", description: "Build together", owner: id, relatedTopics: Array(4).fill(id) }).validate());
  await assert.rejects(new CircleMembership({ circle: id, user: id, role: "admin" }).validate());
  assert.ok(Circle.schema.indexes().some(([key, options]) => key.slug === 1 && options.unique));
  assert.ok(CircleMembership.schema.indexes().some(([key, options]) => key.circle === 1 && key.user === 1 && options.unique));
  assert.ok(Tweet.schema.indexes().some(([key]) => key.circle === 1 && key.timestamp === -1));
});
test("Circle public projection excludes owner credentials and internal fields", () => {
  const circle = { _id: id, slug: "ai-builders", name: "AI Builders", description: "Build together", owner: { _id: id, username: "maker", email: "private@example.test", firebaseUid: "secret" }, relatedTopics: [], visibility: "public", status: "active", seedTag: "internal" };
  const view = circleView(circle);
  assert.equal(view.owner.username, "maker");
  assert.doesNotMatch(JSON.stringify(view), /email|firebaseUid|seedTag/);
});
