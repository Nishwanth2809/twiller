import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import mongoose from "mongoose";
import { mediaByteRange, mediaDependencies, readMedia, useDatabaseMedia, writeDatabaseMedia } from "../media.js";
import { validateConfiguration } from "../config.js";

test("only staging uses durable database media by default", () => {
  assert.equal(useDatabaseMedia({ TWILLER_DEPLOYMENT_STAGE: "staging" }), true);
  assert.equal(useDatabaseMedia({ TWILLER_DEPLOYMENT_STAGE: "production" }), false);
  assert.equal(useDatabaseMedia({ NODE_ENV: "test" }), false);
});

test("database media flag decouples GridFS from deployment stage", () => {
  // production + database media flag => GridFS
  assert.equal(useDatabaseMedia({ NODE_ENV: "production", MEDIA_STORAGE: "database" }), true);
  assert.equal(useDatabaseMedia({ NODE_ENV: "production", TWILLER_DATABASE_MEDIA: "true" }), true);

  // staging + database media flag => GridFS
  assert.equal(useDatabaseMedia({ TWILLER_DEPLOYMENT_STAGE: "staging", MEDIA_STORAGE: "database" }), true);
  assert.equal(useDatabaseMedia({ TWILLER_DEPLOYMENT_STAGE: "staging", TWILLER_DATABASE_MEDIA: "true" }), true);

  // local default => filesystem
  assert.equal(useDatabaseMedia({}), false);
  assert.equal(useDatabaseMedia({ NODE_ENV: "development" }), false);
  assert.equal(useDatabaseMedia({ NODE_ENV: "test" }), false);

  // production without flag => filesystem (does not enable GridFS merely because NODE_ENV=production)
  assert.equal(useDatabaseMedia({ NODE_ENV: "production" }), false);

  // explicit filesystem flag => filesystem
  assert.equal(useDatabaseMedia({ NODE_ENV: "production", MEDIA_STORAGE: "filesystem" }), false);
  assert.equal(useDatabaseMedia({ TWILLER_DEPLOYMENT_STAGE: "staging", MEDIA_STORAGE: "filesystem" }), false);
  assert.equal(useDatabaseMedia({ TWILLER_DATABASE_MEDIA: "false" }), false);

  // legacy staging backward compatibility
  assert.equal(useDatabaseMedia({ TWILLER_DEPLOYMENT_STAGE: "staging" }), true);
});

test("media storage configuration validation fails safely", () => {
  const base = {
    MONGODB_URI: "mongodb://127.0.0.1:27017/twiller",
    NODE_ENV: "test",
  };
  assert.equal(validateConfiguration({ ...base, MEDIA_STORAGE: "database" }).dbType, "local");
  assert.equal(validateConfiguration({ ...base, MEDIA_STORAGE: "filesystem" }).dbType, "local");
  assert.throws(() => validateConfiguration({ ...base, MEDIA_STORAGE: "s3" }), /MEDIA_STORAGE must be 'database' or 'filesystem'/);
  assert.throws(() => validateConfiguration({ ...base, TWILLER_DATABASE_MEDIA: "invalid" }), /TWILLER_DATABASE_MEDIA must be 'true' or 'false'/);
});

test("production GridFS read, write, filesystem fallback, and disk absence survival", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "twiller-media-gridfs-test-"));
  const oldStorage = process.env.MEDIA_STORAGE;
  const oldStage = process.env.TWILLER_DEPLOYMENT_STAGE;
  const oldDirectory = process.env.MEDIA_DIR;
  const oldBucket = mediaDependencies.bucket;

  process.env.MEDIA_STORAGE = "database";
  delete process.env.TWILLER_DEPLOYMENT_STAGE;
  process.env.MEDIA_DIR = directory;

  const mockFiles = new Map();
  const mockBucket = {
    find(query) {
      const file = mockFiles.get(String(query._id));
      return {
        limit() { return this; },
        async next() {
          if (!file) return null;
          return { _id: query._id, filename: file.filename, length: file.buffer.length };
        },
      };
    },
    openDownloadStream(id) {
      const file = mockFiles.get(String(id));
      if (!file) {
        const stream = new Readable({ read() {} });
        process.nextTick(() => stream.destroy(new Error("File not found")));
        return stream;
      }
      return Readable.from([file.buffer]);
    },
    openUploadStreamWithId(id, filename, options = {}) {
      const stream = new PassThrough();
      const chunks = [];
      stream.on("data", chunk => chunks.push(chunk));
      stream.on("finish", () => {
        const buffer = Buffer.concat(chunks);
        mockFiles.set(String(id), { filename, buffer, contentType: options.contentType });
      });
      return stream;
    },
    async delete(id) {
      mockFiles.delete(String(id));
    },
  };
  mediaDependencies.bucket = () => mockBucket;

  try {
    const testId = new mongoose.Types.ObjectId();
    const testBuffer = Buffer.from("production image payload");
    const record = {
      _id: testId,
      filename: `${testId}.jpg`,
      bytes: testBuffer.length,
      mime: "image/jpeg",
    };

    // 1. New production upload uses GridFS
    await writeDatabaseMedia(record, testBuffer);
    assert.equal(mockFiles.has(String(testId)), true);
    assert.deepEqual(mockFiles.get(String(testId)).buffer, testBuffer);

    // Verify nothing was written to the filesystem directory during GridFS write
    const dirFiles = await readdir(directory);
    assert.equal(dirFiles.length, 0);

    // 2. GridFS read succeeds
    const readBack = await readMedia(record);
    assert.deepEqual(readBack, testBuffer);

    // 3. Media survives simulated filesystem absence (directory completely empty)
    assert.equal(dirFiles.length, 0);
    const readWithoutDisk = await readMedia(record);
    assert.deepEqual(readWithoutDisk, testBuffer);

    // 4. Filesystem fallback remains supported when media is absent from GridFS
    const legacyId = new mongoose.Types.ObjectId();
    const legacyBuffer = Buffer.from("legacy filesystem payload");
    const legacyRecord = {
      _id: legacyId,
      filename: `${legacyId}.jpg`,
      bytes: legacyBuffer.length,
      mime: "image/jpeg",
    };
    // Write legacy file only to disk (not in GridFS)
    await writeFile(path.join(directory, legacyRecord.filename), legacyBuffer);
    const fallbackRead = await readMedia(legacyRecord);
    assert.deepEqual(fallbackRead, legacyBuffer);

    // 5. Missing in both returns null
    const missingId = new mongoose.Types.ObjectId();
    const missingRecord = {
      _id: missingId,
      filename: `${missingId}.jpg`,
      bytes: 10,
    };
    assert.equal(await readMedia(missingRecord), null);
  } finally {
    mediaDependencies.bucket = oldBucket;
    if (oldStorage === undefined) delete process.env.MEDIA_STORAGE;
    else process.env.MEDIA_STORAGE = oldStorage;
    if (oldStage === undefined) delete process.env.TWILLER_DEPLOYMENT_STAGE;
    else process.env.TWILLER_DEPLOYMENT_STAGE = oldStage;
    if (oldDirectory === undefined) delete process.env.MEDIA_DIR;
    else process.env.MEDIA_DIR = oldDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});

test("media byte ranges preserve seeking and reject malformed ranges", () => {
  assert.deepEqual(mediaByteRange("bytes=0-1", 10), { start: 0, end: 1 });
  assert.deepEqual(mediaByteRange("bytes=5-", 10), { start: 5, end: 9 });
  assert.deepEqual(mediaByteRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.deepEqual(mediaByteRange("bytes=0-99", 10), { start: 0, end: 9 });
  assert.equal(mediaByteRange(undefined, 10), null);
  for (const header of ["bytes=10-", "bytes=2-1", "bytes=-0", "bytes=0-1,3-4", "items=0-1"])
    assert.equal(mediaByteRange(header, 10), false);
});

test("non-staging media keeps the existing filesystem read and missing-file behavior", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "twiller-media-test-"));
  const oldStage = process.env.TWILLER_DEPLOYMENT_STAGE;
  const oldDirectory = process.env.MEDIA_DIR;
  delete process.env.TWILLER_DEPLOYMENT_STAGE;
  process.env.MEDIA_DIR = directory;
  try {
    const record = { filename: `${"a".repeat(24)}.jpg` };
    assert.equal(await readMedia(record), null);
    await writeFile(path.join(directory, record.filename), Buffer.from("image bytes"));
    assert.deepEqual(await readMedia(record), Buffer.from("image bytes"));
  } finally {
    if (oldStage === undefined) delete process.env.TWILLER_DEPLOYMENT_STAGE;
    else process.env.TWILLER_DEPLOYMENT_STAGE = oldStage;
    if (oldDirectory === undefined) delete process.env.MEDIA_DIR;
    else process.env.MEDIA_DIR = oldDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});

test("restore utility refuses non-staging databases before reading a source file", () => {
  const script = fileURLToPath(new URL("../scripts/restore-staging-media.mjs", import.meta.url));
  for (const uri of [
    "mongodb://127.0.0.1:27017/twiller_staging",
    "mongodb+srv://operator:placeholder@cluster.mongodb.net/production",
  ]) {
    const result = spawnSync(process.execPath, [script, "a".repeat(24), "missing-original.jpg"], {
      encoding: "utf8",
      env: {
        ...process.env,
        TWILLER_DEPLOYMENT_STAGE: "staging",
        TWILLER_STAGING_MEDIA_RESTORE: "CONFIRM",
        TWILLER_STAGING_BACKUP_CONFIRMED: "yes",
        MONGODB_URI: uri,
        MONOGDB_URL: "",
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing media restore/);
    assert.doesNotMatch(result.stderr, /operator:placeholder/);
  }
});
