import mongoose from "mongoose";

const AdminAuditLogSchema = mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  action: {
    type: String,
    enum: ["USER_FROZEN", "USER_RESUMED", "USER_DELETED", "POST_REMOVED"],
    required: true,
  },
  targetType: {
    type: String,
    enum: ["user", "post"],
    required: true,
  },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: { type: String, default: "" },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("AdminAuditLog", AdminAuditLogSchema);
