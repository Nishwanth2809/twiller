import crypto from "node:crypto";
import { fail } from "./security.js";

// This service only processes purchases. Recovery never shares these mutations.
export async function verifyPurchase(input, owner, { Subscription, User, mongoose, razorpay, secret, plans }) {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = input;
  const purchase = await Subscription.findOne({ razorpayOrderId: orderId });
  if (!purchase) fail(404, "ORDER_NOT_FOUND", "Order not found");
  if (String(purchase.userId) !== String(owner._id)) fail(403, "FORBIDDEN", "Order access denied");
  if (input.plan !== undefined && input.plan !== purchase.plan) fail(409, "PURCHASE_MISMATCH", "Purchased plan does not match");
  if (!plans[purchase.plan] || purchase.amount !== plans[purchase.plan].price || (purchase.currency || "INR") !== "INR") fail(409, "PURCHASE_MISMATCH", "Stored purchase requires reconciliation");
  if (!secret) fail(503, "PAYMENT_UNAVAILABLE", "Payment verification is unavailable");
  const expected = crypto.createHmac("sha256", secret).update(`${purchase.razorpayOrderId}|${paymentId}`).digest("hex");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) fail(400, "INVALID_SIGNATURE", "Invalid payment signature");
  const [payment, order] = await Promise.all([razorpay.payments.fetch(paymentId), razorpay.orders.fetch(orderId)]);
  if (payment.order_id !== orderId || payment.amount !== purchase.amount || payment.currency !== "INR" || payment.status !== "captured" || order.id !== orderId || order.amount !== purchase.amount || order.currency !== "INR" || order.status !== "paid") fail(409, "PURCHASE_MISMATCH", "Payment has not settled for this order");
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const current = await Subscription.findOne({ _id: purchase._id }).session(session);
      if (current.status === "paid") {
        if (current.razorpayPaymentId !== paymentId) fail(409, "PAYMENT_REPLAY", "Order already processed with another payment");
        result = { success: true, alreadyProcessed: true, plan: current.plan, planExpiresAt: current.fulfillmentExpiresAt || owner.planExpiresAt };
        return;
      }
      if (current.status !== "created") fail(409, "ORDER_STATE", "Order is not pending");
      const paidAt = new Date();
      const expiresAt = new Date(paidAt.getTime() + 30 * 86400000);
      const updated = await Subscription.updateOne({ _id: current._id, status: "created" }, { $set: { status: "paid", razorpayPaymentId: paymentId, paidAt, fulfillmentExpiresAt: expiresAt } }, { session, runValidators: true });
      if (updated.modifiedCount !== 1) fail(409, "PAYMENT_CONFLICT", "Payment is being processed. Please retry");
      const user = await User.findOneAndUpdate({ _id: owner._id }, { $set: { plan: current.plan, tweetCount: 0, planExpiresAt: expiresAt, planActivatedAt: paidAt, quotaStartsAt: paidAt, quotaResetsAt: expiresAt } }, { session, new: true, runValidators: true });
      if (!user) fail(404, "NOT_FOUND", "Account not found");
      result = { success: true, alreadyProcessed: false, plan: current.plan, planExpiresAt: expiresAt };
    });
  } finally { await session.endSession(); }
  return result;
}
