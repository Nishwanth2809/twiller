// Guarded operator script to promote an existing user to role=admin.
// Requires explicit confirmation switch to guard against accidental execution.
import mongoose from "mongoose";
import User from "../models/user.js";
import { normalizeHandle } from "../handles.js";

const args = process.argv.slice(2);
let targetUid = process.env.ADMIN_FIREBASE_UID || "";
let targetEmail = "";
let targetUsername = "";
let confirmed = process.env.TWILLER_PROMOTE_ADMIN_CONFIRMED === "yes";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--confirm") {
    confirmed = true;
  } else if (args[i] === "--uid" && args[i + 1]) {
    targetUid = args[++i];
  } else if (args[i] === "--email" && args[i + 1]) {
    targetEmail = args[++i];
  } else if (args[i] === "--username" && args[i + 1]) {
    targetUsername = args[++i];
  }
}

if (!confirmed) {
  console.error("Refusing admin promotion: explicit confirmation required (pass --confirm or set TWILLER_PROMOTE_ADMIN_CONFIRMED=yes)");
  process.exit(1);
}

const uri = process.env.MONGODB_URI || process.env.MONOGDB_URL;
if (!uri) {
  console.error("MONGODB_URI environment variable required");
  process.exit(1);
}

const query = {};
if (targetUid) {
  query.firebaseUid = targetUid.trim();
} else if (targetEmail) {
  query.email = targetEmail.trim().toLowerCase();
} else if (targetUsername) {
  query.username = normalizeHandle(targetUsername.trim());
} else {
  console.error("Provide a target via --uid, --email, --username, or set ADMIN_FIREBASE_UID");
  process.exit(1);
}

try {
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  const matches = await User.find(query).limit(2);
  if (matches.length === 0) {
    console.error("User not found for identifier");
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error("Ambiguous user match: multiple users found");
    process.exit(1);
  }

  const user = matches[0];
  if (user.role === "admin") {
    console.log(`User "${user.username}" (ID: ${user._id}) is already an administrator.`);
    process.exit(0);
  }

  const updateResult = await User.updateOne(
    { _id: user._id, role: { $ne: "admin" } },
    { $set: { role: "admin" } }
  );

  if (updateResult.matchedCount !== 1) {
    console.error("User role was not 'user' or changed concurrently; aborting");
    process.exit(1);
  }

  console.log(`Successfully promoted user "${user.username}" (ID: ${user._id}) to role=admin.`);
} catch (err) {
  console.error("Admin promotion failed:", err.message);
  process.exit(1);
} finally {
  await mongoose.disconnect();
}
