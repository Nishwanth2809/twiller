// Restore an existing published staging upload from its original local file.
// This preserves the media ID and every post/profile URL that references it.
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import { readFile, stat } from "node:fs/promises";
import Media from "../models/media.js";
import { AUDIO_MAX, MEDIA_BUCKET, validateMedia, writeDatabaseMedia } from "../media.js";

const [id, sourcePath] = process.argv.slice(2);
const uri = process.env.MONGODB_URI;
if (process.env.TWILLER_DEPLOYMENT_STAGE !== "staging" ||
    process.env.TWILLER_STAGING_MEDIA_RESTORE !== "CONFIRM" ||
    process.env.TWILLER_STAGING_BACKUP_CONFIRMED !== "yes" ||
    process.env.MONOGDB_URL || !uri?.startsWith("mongodb+srv://") ||
    !new URL(uri).hostname.endsWith(".mongodb.net") ||
    new URL(uri).pathname !== "/twiller_staging") {
  throw new Error("Refusing media restore: staging URI, backup, and restore confirmation required");
}
if (!/^[a-f\d]{24}$/.test(id || "") || !sourcePath) {
  throw new Error("Provide an existing 24-character media ID and its original local file path");
}

const file = await stat(sourcePath);
if (!file.isFile() || file.size < 1 || file.size > AUDIO_MAX) {
  throw new Error("Original media file is missing or exceeds the upload limit");
}
const source = await readFile(sourcePath);

try {
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  if (mongoose.connection.db.databaseName !== "twiller_staging") throw new Error("Wrong database selected");
  const record = await Media.findById(id);
  if (!record || !record.published || !["image", "audio"].includes(record.kind)) {
    throw new Error("Published staging media record not found");
  }
  if (!/^[a-f\d]{24}\.(jpg|wav|mp3)$/.test(record.filename)) {
    throw new Error("Invalid staging media record");
  }
  const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: MEDIA_BUCKET });
  if (await bucket.find({ _id: record._id }).limit(1).hasNext()) {
    throw new Error("Media bytes already exist; refusing to overwrite them");
  }
  const restored = await validateMedia(source, record.kind);
  if (restored.mime !== record.mime || !record.filename.endsWith(`.${restored.extension}`)) {
    throw new Error("Original file does not match the media record type");
  }
  try {
    await writeDatabaseMedia(record, restored.buffer);
    const updated = await Media.updateOne(
      { _id: record._id, published: true },
      { $set: { bytes: restored.buffer.length, ...(record.kind === "audio" ? { duration: restored.duration } : {}) } },
    );
    if (updated.matchedCount !== 1) throw new Error("Media record changed during restore");
  } catch (error) {
    await bucket.delete(record._id).catch(() => {});
    throw error;
  }
  console.log(`Restored staging media ${id}; verify its existing /media/${id} URL after deployment`);
} finally {
  await mongoose.disconnect();
}
