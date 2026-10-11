import test from "node:test";
import assert from "node:assert/strict";
import Notification from "../models/notification.js";
import { addNotifications, markRead } from "../notification-operations.js";

test("TW-020: notification model constrains event types and indexes recipient reads", () => {
  const indexes = Notification.schema.indexes().map(([keys]) => keys);
  assert.ok(indexes.some(keys => keys.recipient === 1 && keys.createdAt === -1));
  assert.ok(indexes.some(keys => keys.recipient === 1 && keys.readAt === 1));
  const invalid = new Notification({ recipient: "111111111111111111111111", actor: "222222222222222222222222", type: "password-reset" });
  assert.ok(invalid.validateSync().errors.type);
});

test("TW-020: notification writes discard self-events and duplicate recipient events", async () => {
  const original = Notification.insertMany;
  let inserted;
  let passedOptions;
  Notification.insertMany = async (records, options) => { inserted = records; passedOptions = options; return records; };
  try {
    const session = { isolated: true };
    const record = { recipient: "111111111111111111111111", actor: "222222222222222222222222", type: "follow" };
    await addNotifications([record, { ...record }, { ...record, recipient: record.actor }], session);
    assert.equal(inserted.length, 1);
    assert.equal(passedOptions.session, session);
  } finally { Notification.insertMany = original; }
});

test("TW-020: marking read always scopes the write to the authenticated recipient", async () => {
  const original = Notification.findOneAndUpdate;
  let filter;
  let result = { _id: "333333333333333333333333" };
  Notification.findOneAndUpdate = query => {
    filter = query;
    const chained = { populate() { return this; }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
    return chained;
  };
  try {
    await markRead("111111111111111111111111", "333333333333333333333333");
    assert.deepEqual(filter, { _id: "333333333333333333333333", recipient: "111111111111111111111111" });
    result = null;
    await assert.rejects(markRead("222222222222222222222222", "333333333333333333333333"), /Notification not found/);
    assert.equal(filter.recipient, "222222222222222222222222");
  } finally { Notification.findOneAndUpdate = original; }
});
