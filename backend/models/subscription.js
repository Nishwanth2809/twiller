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
  paidAt: { type: Date, default: null },
  invoiceSentAt: { type: Date, default: null },
});

export default mongoose.model("Subscription", SubscriptionSchema);
