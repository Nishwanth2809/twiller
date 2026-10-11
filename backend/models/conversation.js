import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    pairKey: { type: String },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    lastMessage: {
      type: String,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    lastMessageSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Ensure a conversation between two users is unique
conversationSchema.index({ participants: 1 });
conversationSchema.path("participants").validate(value => value.length === 2 && String(value[0]) !== String(value[1]), "Two distinct participants required");
conversationSchema.index({ pairKey: 1 }, { unique: true, partialFilterExpression: { pairKey: { $type: "string" } } });

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
