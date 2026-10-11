import Notification from "./models/notification.js";
import { fail } from "./security.js";

export async function addNotifications(records, session) {
  const unique = [...new Map(records.filter(record => String(record.recipient) !== String(record.actor))
    .map(record => [`${record.recipient}:${record.actor}:${record.type}:${record.post || ""}`, record])).values()];
  if (unique.length) await Notification.insertMany(unique, { session });
}

export async function markRead(recipient, id) {
  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient }, { $set: { readAt: new Date() } }, { new: true },
  ).populate("actor", "_id username displayName avatar")
   .populate({ path: "post", select: "_id content timestamp deletedAt author", populate: { path: "author", select: "_id username displayName avatar" } });
  if (!notification) fail(404, "NOT_FOUND", "Notification not found");
  return notification;
}
