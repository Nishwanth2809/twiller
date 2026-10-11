import mongoose from "mongoose";
import { fail } from "./security.js";
export const LIMITS = { free: 1, bronze: 3, silver: 5, gold: -1 };
export function quotaState(user, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const paid = user.plan !== "free" && user.planExpiresAt && new Date(user.planExpiresAt) > now;
  const expired = user.plan !== "free" && !paid;
  const plan = paid ? user.plan : "free";
  const start = paid ? new Date(user.planActivatedAt || user.quotaStartsAt || now) : monthStart;
  const reset = paid ? new Date(user.planExpiresAt) : nextMonth;
  const rollover = expired || (!paid && user.quotaResetsAt && new Date(user.quotaResetsAt) <= now);
  const used = rollover ? 0 : Math.max(0, user.tweetCount || 0);
  return { plan, tweetCount: used, planLimit: LIMITS[plan] ?? 1,
    planExpiresAt: paid ? new Date(user.planExpiresAt) : null,
    quotaStartsAt: start, quotaResetsAt: reset,
    remaining: LIMITS[plan] === -1 ? -1 : Math.max(0, (LIMITS[plan] ?? 1) - used),
    replyConsumesQuota: true };
}
export async function transaction(action) {
  const session = await mongoose.startSession();
  let result;
  try { await session.withTransaction(async () => { result = await action(session); }); }
  finally { await session.endSession(); }
  return result;
}
export async function consumeQuota(User, owner, session, now = new Date()) {
  const user = await User.findById(owner).session(session);
  if (!user) fail(404, "NOT_FOUND", "Account not found");
  const state = quotaState(user, now);
  if (state.remaining === 0) fail(403, "QUOTA_EXHAUSTED", "Posting allowance reached for this period");
  await User.updateOne({ _id: owner }, { $set: { plan: state.plan, planExpiresAt: state.planExpiresAt,
    quotaStartsAt: state.quotaStartsAt, quotaResetsAt: state.quotaResetsAt, tweetCount: state.tweetCount + 1 } }, { session, runValidators: true });
  return state;
}
