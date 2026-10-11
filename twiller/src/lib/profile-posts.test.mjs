import assert from "node:assert/strict";
import test from "node:test";
import { appendUniquePage, prependOwnProfilePost } from "./profile-posts.ts";

const own = { _id: "new", author: { _id: "user-a" }, parentId: null };

test("prepends the canonical own post and preserves existing order", () => {
  const older = { _id: "older", author: { _id: "user-a" }, parentId: null };
  assert.deepEqual(prependOwnProfilePost([older], own, "user-a"), [own, older]);
});

test("reconciles duplicate post IDs to one canonical entry at the front", () => {
  const duplicate = { ...own, content: "stale" };
  const result = prependOwnProfilePost([duplicate, { _id: "older", author: { _id: "user-a" } }, duplicate], own, "user-a");
  assert.deepEqual(result, [own, { _id: "older", author: { _id: "user-a" } }]);
});

test("does not insert another user's post or a reply in the Posts tab", () => {
  const existing = [{ _id: "older", author: { _id: "user-a" } }];
  const otherUser = { _id: "other", author: { _id: "user-b" }, parentId: null };
  const reply = { _id: "reply", author: { _id: "user-a" }, parentId: "parent" };
  assert.equal(prependOwnProfilePost(existing, otherUser, "user-a"), existing);
  assert.equal(prependOwnProfilePost(existing, reply, "user-a"), existing);
});

test("appends profile pages in server order and removes overlap by ID", () => {
  const firstPage = [{ _id: "20" }, { _id: "19" }];
  const secondPage = [{ _id: "19" }, { _id: "18" }, { _id: "17" }];
  assert.deepEqual(appendUniquePage(firstPage, secondPage), [
    { _id: "20" }, { _id: "19" }, { _id: "18" }, { _id: "17" },
  ]);
});

test("an empty profile page leaves the current order unchanged", () => {
  const current = [{ _id: "20" }, { _id: "19" }];
  assert.deepEqual(appendUniquePage(current, []), current);
});
