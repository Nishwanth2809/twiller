import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mediaByteRange, readMedia, useDatabaseMedia } from "../media.js";

test("only staging uses durable database media by default", () => {
  assert.equal(useDatabaseMedia({ TWILLER_DEPLOYMENT_STAGE: "staging" }), true);
  assert.equal(useDatabaseMedia({ TWILLER_DEPLOYMENT_STAGE: "production" }), false);
  assert.equal(useDatabaseMedia({ NODE_ENV: "test" }), false);
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
