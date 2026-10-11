// Explicit, staging-only index setup. Never run from app startup or a Render
// build hook. Review the audit and complete a backup before using CREATE.
import mongoose from "mongoose";
import { auditIntegrity, prepareIndexes } from "../readiness.js";

const uri = process.env.MONGODB_URI;
if (process.env.TWILLER_DEPLOYMENT_STAGE !== "staging" ||
    process.env.TWILLER_STAGING_INDEXES !== "CREATE" ||
    process.env.TWILLER_STAGING_BACKUP_CONFIRMED !== "yes" ||
    process.env.MONOGDB_URL || !uri?.startsWith("mongodb+srv://") ||
    !new URL(uri).hostname.endsWith(".mongodb.net") ||
    new URL(uri).pathname !== "/twiller_staging") {
  throw new Error("Refusing index setup: explicit staging URI, CREATE switch, and backup confirmation required");
}

try {
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  if (mongoose.connection.db.databaseName !== "twiller_staging") throw new Error("Wrong database selected");
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName || !hello.isWritablePrimary || !hello.logicalSessionTimeoutMinutes) {
    throw new Error("Staging requires a transaction-capable replica-set primary");
  }
  const audit = await auditIntegrity();
  if (Object.values(audit).some(Boolean)) throw new Error("Identity/conversation integrity audit failed; reconcile before index creation");
  await prepareIndexes(false);
  await prepareIndexes(true);
  console.log("Staging index setup verified for twiller_staging");
} finally {
  await mongoose.disconnect();
}
