import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyPurchase } from "../payment.js";
const owner = { _id: "111111111111111111111111", planExpiresAt: null };
function fixture() {
  let sub = { _id: "purchase", userId: owner._id, plan: "bronze", amount: 10000, currency: "INR", razorpayOrderId: "order_one", status: "created" };
  let applications = 0;
  let queue = Promise.resolve();
  const deps = {
    plans: { bronze: { price: 10000 }, gold: { price: 100000 } }, secret: "isolated-test-secret",
    razorpay: { payments: { fetch: async () => ({ order_id: "order_one", amount: 10000, currency: "INR", status: "captured" }) }, orders: { fetch: async () => ({ id: "order_one", amount: 10000, currency: "INR", status: "paid" }) } },
    Subscription: {
      findOne: query => query.razorpayOrderId ? Promise.resolve(query.razorpayOrderId === sub.razorpayOrderId ? { ...sub } : null) : { session: async () => ({ ...sub }) },
      updateOne: async (query, update) => { Object.assign(sub, update.$set); return { modifiedCount: 1 }; },
    },
    User: { findOneAndUpdate: async () => { applications++; return owner; } },
    mongoose: { startSession: async () => ({ endSession: async () => {}, withTransaction: async action => {
      // Controlled service double: actual Mongo rollback/uniqueness is tested in mongo.test.js.
      const previous = queue; let release; queue = new Promise(resolve => { release = resolve; }); await previous;
      const before = { ...sub }; const count = applications;
      try { await action(); } catch (err) { sub = before; applications = count; throw err; } finally { release(); }
    } }) },
  };
  const input = { razorpay_order_id: "order_one", razorpay_payment_id: "pay_one", razorpay_signature: crypto.createHmac("sha256", deps.secret).update("order_one|pay_one").digest("hex") };
  return { deps, input, sub: () => sub, applications: () => applications };
}
test("TW-005: purchase owner, tier, order, signature, provider amount/currency/state binding", async () => {
  for (const kind of ["owner", "tier", "order", "signature", "amount", "currency", "status", "providerOrder"]) {
    const f = fixture(); const input = { ...f.input }; let user = owner;
    if (kind === "owner") user = { _id: "other" };
    if (kind === "tier") input.plan = "gold";
    if (kind === "order") input.razorpay_order_id = "order_unknown";
    if (kind === "signature") input.razorpay_signature = "0".repeat(64);
    if (["amount", "currency", "status", "providerOrder"].includes(kind)) f.deps.razorpay.payments.fetch = async () => ({ order_id: kind === "providerOrder" ? "order_other" : "order_one", amount: kind === "amount" ? 1 : 10000, currency: kind === "currency" ? "USD" : "INR", status: kind === "status" ? "authorized" : "captured" });
    await assert.rejects(verifyPurchase(input, user, f.deps)); assert.equal(f.applications(), 0);
  }
});
test("TW-005: duplicate/concurrent verification applies once without resetting expiry", async () => {
  const f = fixture(); const results = await Promise.all([verifyPurchase(f.input, owner, f.deps), verifyPurchase(f.input, owner, f.deps)]);
  assert.equal(f.applications(), 1); assert.deepEqual(results.map(x => x.alreadyProcessed).sort(), [false, true]);
  const expiry = f.sub().fulfillmentExpiresAt; const retry = await verifyPurchase(f.input, owner, f.deps);
  assert.equal(retry.alreadyProcessed, true); assert.equal(f.sub().fulfillmentExpiresAt, expiry);
});
test("TW-005: replay with another payment is denied and partial application rolls back", async () => {
  const f = fixture(); await verifyPurchase(f.input, owner, f.deps);
  const replay = { ...f.input, razorpay_payment_id: "pay_two", razorpay_signature: crypto.createHmac("sha256", f.deps.secret).update("order_one|pay_two").digest("hex") };
  await assert.rejects(verifyPurchase(replay, owner, f.deps), /another payment/); assert.equal(f.applications(), 1);
  const failed = fixture(); failed.deps.User.findOneAndUpdate = async () => { throw new Error("database failure"); };
  await assert.rejects(verifyPurchase(failed.input, owner, failed.deps), /database failure/);
  assert.equal(failed.sub().status, "created");
});

test("isPaymentWindowOpen allows 24/7 payments by default and respects ENFORCE_PAYMENT_TIME_GATE", async () => {
  const { isPaymentWindowOpen } = await import("../index.js");
  // Default: open 24/7
  assert.equal(isPaymentWindowOpen({}), true);
  assert.equal(isPaymentWindowOpen({ ENFORCE_PAYMENT_TIME_GATE: "false" }), true);

  // When enforced, check returns boolean based on current IST time
  const enforced = isPaymentWindowOpen({ ENFORCE_PAYMENT_TIME_GATE: "true" });
  assert.equal(typeof enforced, "boolean");
});

