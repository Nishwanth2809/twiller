import mongoose from "mongoose";

const SubscriptionSchema = mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  plan: {
    type: String,
    enum: ["bronze", "silver", "gold"],
    required: true,
  },
  razorpayOrderId: { type: String, required: true },
  razorpayPaymentId: { type: String, default: null },
  amount: { type: Number, required: true }, // in paise
  status: {
    type: String,
    enum: ["created", "paid", "failed"],
    default: "created",
  },
  currency: { type: String, enum: ["INR"], default: "INR" },
  fulfillmentExpiresAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  invoiceSentAt: { type: Date, default: null },
  invoiceStatus: { type: String, enum: ["pending","sending","sent","failed"], default: "pending" },
  invoiceAttemptAt: Date,
});

SubscriptionSchema.index({ razorpayOrderId: 1 }, { unique: true });
SubscriptionSchema.index({ razorpayPaymentId: 1 }, { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: "string" } } });

export default mongoose.model("Subscription", SubscriptionSchema);
