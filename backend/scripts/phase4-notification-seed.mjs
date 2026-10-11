import { createHash } from "node:crypto";
import mongoose from "mongoose";
import User from "../models/user.js";
import Notification from "../models/notification.js";

// Deliberately fixed: this utility never reads .env or a caller-supplied URI.
const ACCEPTANCE_URI = "mongodb://127.0.0.1:27017/twiller_phase3_acceptance?replicaSet=phase1";
const PRIMARY_COUNT = 48;
const FOREIGN_COUNT = 3;

function usage() {
  console.log(`Local TW-020 notification pagination data only\n\nUsage:\n  node scripts/phase4-notification-seed.mjs seed <recipient-username> [other-test-username]\n  node scripts/phase4-notification-seed.mjs cleanup <recipient-username>\n\nCreates ${PRIMARY_COUNT} marked notifications for the recipient (more than the 30-item page) and optionally ${FOREIGN_COUNT} notifications for a second existing test user. It also creates clearly marked actor accounts. The URI is fixed to 127.0.0.1:27017/twiller_phase3_acceptance (replica set phase1).`);
}

function stableId(key) {
  return new mongoose.Types.ObjectId(createHash("sha256").update(key).digest("hex").slice(0, 24));
}

function idTag(id) {
  return String(id).slice(-10).toLowerCase();
}

function makePlan(recipient, otherRecipient) {
  const recipientId = String(recipient._id);
  const recipientTag = idTag(recipientId);
  const marker = `TWILLER_PHASE4_NOTIFICATION_${recipientTag}`;
  const actors = [];
  const recipientActorIds = [];
  const notifications = [];
  const expectedNotifications = [];
  const now = Date.now();

  for (let index = 1; index <= PRIMARY_COUNT + FOREIGN_COUNT; index += 1) {
    const isForeign = index > PRIMARY_COUNT;
    const number = String(isForeign ? index - PRIMARY_COUNT : index).padStart(2, "0");
    const kind = isForeign ? "other" : "actor";
    const key = `twiller-phase4-notifications:${recipientId}:${kind}:${number}`;
    const actorId = stableId(`${key}:user`);
    const username = `p4notif_${isForeign ? "o" : "a"}_${recipientTag}_${number}`;
    const email = `p4-notification-${kind}-${recipientTag}-${number}@example.test`;
    const actor = {
      _id: actorId,
      username,
      email,
      displayName: `P4 Notification ${kind} ${number}`,
      joinedDate: new Date(Date.UTC(2025, 0, 1) + index * 60_000),
      ...(!isForeign ? { following: [recipient._id] } : {}),
    };
    actors.push(actor);
    if (!isForeign) recipientActorIds.push(actorId);

    // Always reserve deterministic IDs for the optional foreign rows so cleanup
    // can remove a prior run even if its second username is not supplied again.
    const notification = {
      _id: stableId(`${key}:notification`),
      recipient: isForeign ? otherRecipient?._id : recipient._id,
      actor: actorId,
      type: "follow",
      post: null,
      readAt: !isForeign && index % 4 === 0 ? new Date(now - (index - 1) * 60_000) : null,
      createdAt: new Date(now - (index - 1) * 60_000),
      updatedAt: new Date(now - (index - 1) * 60_000),
    };
    expectedNotifications.push(notification);
    if (isForeign && !otherRecipient) continue;
    notifications.push(notification);
  }

  const allActorIds = actors.map(actor => actor._id);
  const notificationIds = [];
  for (let index = 1; index <= PRIMARY_COUNT + FOREIGN_COUNT; index += 1) {
    const isForeign = index > PRIMARY_COUNT;
    const number = String(isForeign ? index - PRIMARY_COUNT : index).padStart(2, "0");
    notificationIds.push(stableId(`twiller-phase4-notifications:${recipientId}:${isForeign ? "other" : "actor"}:${number}:notification`));
  }
  return { recipientId, recipientTag, marker, actors, recipientActorIds, allActorIds, notifications, expectedNotifications, notificationIds };
}

async function assertNoIdCollisions(plan, session, allowAbsentNotifications = true) {
  const existingUsers = await User.find({ _id: { $in: plan.allActorIds } }).select("_id username email").session(session).lean();
  for (const existing of existingUsers) {
    const expected = plan.actors.find(actor => String(actor._id) === String(existing._id));
    if (!expected || expected.username !== existing.username || expected.email !== existing.email) {
      throw new Error("A deterministic test-actor ID is occupied by a different record; no seed data was changed.");
    }
  }

  const existingNotifications = await Notification.find({ _id: { $in: plan.notificationIds } })
    .select("_id actor type recipient").session(session).lean();
  for (const existing of existingNotifications) {
    const expected = plan.expectedNotifications.find(item => String(item._id) === String(existing._id));
    const actorMatches = String(expected?.actor) === String(existing.actor);
    const recipientMatches = !expected?.recipient || String(expected.recipient) === String(existing.recipient);
    if (!actorMatches || !recipientMatches || existing.type !== "follow") {
      throw new Error("A deterministic test-notification ID is occupied by a different record; no seed data was changed.");
    }
    if (!expected && !allowAbsentNotifications) throw new Error("Unexpected seeded notification state.");
  }
}

async function seed(plan, recipientId, session) {
  await assertNoIdCollisions(plan, session);
  await User.bulkWrite(plan.actors.map(actor => ({
    updateOne: { filter: { _id: actor._id }, update: { $setOnInsert: actor }, upsert: true },
  })), { session, ordered: true });
  await Notification.bulkWrite(plan.notifications.map(notification => ({
    updateOne: { filter: { _id: notification._id }, update: { $setOnInsert: notification }, upsert: true },
  })), { session, ordered: true });
  await User.updateOne(
    { _id: recipientId },
    { $addToSet: { followers: { $each: plan.recipientActorIds } } },
    { session },
  );
}

async function cleanup(plan, recipientId, session) {
  await assertNoIdCollisions(plan, session);
  await User.updateOne(
    { _id: recipientId },
    { $pull: { followers: { $in: plan.recipientActorIds } } },
    { session },
  );
  await Notification.deleteMany({ _id: { $in: plan.notificationIds } }, { session });
  await User.deleteMany({ _id: { $in: plan.allActorIds } }, { session });
}

const [action, recipientUsername, otherUsername] = process.argv.slice(2);
if (action === "--help" || action === "-h" || !action) {
  usage();
  process.exit(0);
}
if (!new Set(["seed", "cleanup"]).has(action) || !/^[a-z0-9_]{3,50}$/i.test(recipientUsername || "") || (otherUsername && !/^[a-z0-9_]{3,50}$/i.test(otherUsername))) {
  usage();
  process.exitCode = 2;
} else {
  try {
    await mongoose.connect(ACCEPTANCE_URI, { serverSelectionTimeoutMS: 5_000 });
    const connection = mongoose.connection;
    if (connection.host !== "127.0.0.1" || connection.port !== 27017 || connection.name !== "twiller_phase3_acceptance") {
      throw new Error("Refusing to continue: connection is not the fixed local acceptance database.");
    }
    const hello = await connection.db.admin().command({ hello: 1 });
    if (hello.setName !== "phase1" || hello.isWritablePrimary !== true) {
      throw new Error("Refusing to write: local replica set phase1 is not PRIMARY.");
    }

    const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const recipient = await User.findOne({ username: new RegExp(`^${escaped(recipientUsername)}$`, "i") }).select("_id username").lean();
    if (!recipient) throw new Error("The specified existing local acceptance recipient was not found; no records were changed.");
    let otherRecipient = null;
    if (action === "seed" && otherUsername) {
      otherRecipient = await User.findOne({ username: new RegExp(`^${escaped(otherUsername)}$`, "i") }).select("_id username").lean();
      if (!otherRecipient) throw new Error("The optional second local acceptance user was not found; no records were changed.");
      if (String(otherRecipient._id) === String(recipient._id)) throw new Error("The second recipient must be a different test account.");
    }
    const plan = makePlan(recipient, otherRecipient);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (action === "seed") await seed(plan, recipient._id, session);
        else await cleanup(plan, recipient._id, session);
      });
    } finally {
      await session.endSession();
    }

    if (action === "seed") {
      console.log(`Seed complete for @${recipient.username}: ${PRIMARY_COUNT} marked notifications, ${PRIMARY_COUNT} synthetic follower actors${otherRecipient ? `, and ${FOREIGN_COUNT} notifications for @${otherRecipient.username}` : ""}. Re-running is safe.`);
      console.log(`Seed tag: [${plan.marker}] (actor names and IDs are marked with the same TWILLER_PHASE4_NOTIFICATION tag).`);
      console.log(`Cleanup command: node scripts/phase4-notification-seed.mjs cleanup ${recipient.username}`);
    } else {
      console.log(`Cleanup complete for @${recipient.username}: deterministic notification seed records and synthetic actor accounts were removed.`);
    }
  } catch (error) {
    console.error(`Notification seed ${action} failed safely: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
