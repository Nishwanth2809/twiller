import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { quotaState } from "../quota.js";
import { normalizeHandle, pairKey } from "../handles.js";
import { encodeCursor, decodeCursor, cursorFilter, literalSearch, pageResult } from "../pagination.js";
import { validateMedia } from "../media.js";
import { corsOrigins, firebaseAuthEmulatorConfig, validateConfiguration } from "../config.js";

test("TW-010: quota state uses UTC calendar months for free and 30-day purchase periods for paid", () => {
  const now = new Date("2026-03-31T23:00:00.000Z");
  const free = quotaState({ plan: "free", tweetCount: 1, quotaResetsAt: new Date("2026-04-01T00:00:00.000Z") }, now);
  assert.equal(free.tweetCount, 1);
  assert.equal(free.quotaResetsAt.toISOString(), "2026-04-01T00:00:00.000Z");
  const reset = quotaState({ plan: "free", tweetCount: 1, quotaResetsAt: new Date("2026-03-01T00:00:00.000Z") }, now);
  assert.equal(reset.tweetCount, 0);
  const paid = quotaState({ plan: "bronze", tweetCount: 2, planActivatedAt: new Date("2026-03-15T00:00:00Z"), planExpiresAt: new Date("2026-04-14T00:00:00Z") }, now);
  assert.equal(paid.plan, "bronze"); assert.equal(paid.tweetCount, 2);
  assert.equal(paid.quotaResetsAt.toISOString(), "2026-04-14T00:00:00.000Z");
  assert.equal(quotaState({ plan: "silver", tweetCount: 5, planExpiresAt: new Date("2026-03-01") }, now).plan, "free");
});

test("TW-019/TW-034: handles normalize and reject reserved names; participant pairs are canonical", () => {
  assert.equal(normalizeHandle("Alice_2"), "alice_2");
  for (const value of ["ab", "bad.name", "messages", "x".repeat(51)]) assert.throws(() => normalizeHandle(value));
  const ids = ["bbbbbbbbbbbbbbbbbbbbbbbb", "aaaaaaaaaaaaaaaaaaaaaaaa"];
  assert.equal(pairKey(ids), pairKey(ids.reverse()));
  assert.throws(() => pairKey([ids[0], ids[0]]));
});

test("TW-013/TW-041: stable cursor encodes timestamp and id, and pages preserve deterministic order", () => {
  const rows = Array.from({ length: 3 }, (_, index) => ({ _id: String(index + 1).padStart(24, "0"), createdAt: new Date(1000 + index) }));
  const cursor = encodeCursor(rows[1], "createdAt");
  assert.deepEqual(decodeCursor(cursor), { t: rows[1].createdAt, id: rows[1]._id });
  assert.deepEqual(cursorFilter(cursor, "createdAt"), { $or: [{ createdAt: { $lt: rows[1].createdAt } }, { createdAt: rows[1].createdAt, _id: { $lt: rows[1]._id } }] });
  assert.deepEqual(pageResult([...rows].reverse(), 2, "createdAt", true).items.map(row => row._id), [rows[1]._id, rows[2]._id]);
  assert.throws(() => decodeCursor("bad"));
});

test("TW-037/TW-040: media and search inputs are bounded and parsed literally", async () => {
  assert.equal(literalSearch("a+b").test("a+b"), true);
  assert.equal(literalSearch("a+b").test("aaab"), false);
  assert.equal(literalSearch("नमस्ते").test("नमस्ते"), true);
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  const valid = await validateMedia(png, "image"); assert.equal(valid.mime, "image/jpeg");
  await assert.rejects(validateMedia(Buffer.from("not an image"), "image"));
  await assert.rejects(validateMedia(Buffer.alloc(10 * 1024 * 1024 + 1), "audio"));
});

test("TW-038/TW-054: origin and local configuration contracts are explicit", () => {
  const env = { NODE_ENV: "test", MONGODB_URI: "mongodb://127.0.0.1:27017/twiller" };
  assert.equal(validateConfiguration(env).production, false);
  assert.ok(corsOrigins(env).has("http://localhost:3000"));
  assert.throws(() => corsOrigins({ ...env, FRONTEND_ORIGINS: "https://example.test/path" }));
  assert.throws(() => validateConfiguration({ ...env, MONGODB_URI: "mongodb+srv://remote.example/db" }));
  assert.throws(() => validateConfiguration({ ...env, MONGODB_URI: undefined, MONOGDB_URL: undefined }));
});

test("local Firebase Auth Emulator requires explicit non-production loopback configuration", () => {
  const valid = { NODE_ENV: "test", TWILLER_LOCAL_AUTH_EMULATOR: "true", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_PROJECT_ID: "demo-twiller-local" };
  assert.deepEqual(firebaseAuthEmulatorConfig(valid), { host: "127.0.0.1:9099", projectId: "demo-twiller-local" });
  assert.equal(firebaseAuthEmulatorConfig({ NODE_ENV: "development" }), null);
  for (const env of [
    { ...valid, NODE_ENV: "production" },
    { ...valid, FIREBASE_AUTH_EMULATOR_HOST: undefined },
    { ...valid, FIREBASE_AUTH_EMULATOR_HOST: "0.0.0.0:9099" },
    { ...valid, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1" },
    { ...valid, FIREBASE_PROJECT_ID: "twill-live-project" },
  ]) assert.throws(() => firebaseAuthEmulatorConfig(env));
  assert.throws(() => firebaseAuthEmulatorConfig({ NODE_ENV: "production", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }));
});

test("TW-044: browser upload helper is used instead of a privileged third-party credential", async () => {
  const fs = await import("node:fs/promises");
  const composer = await fs.readFile(new URL("../../twiller/src/components/TweetComposer.tsx", import.meta.url), "utf8");
  const editor = await fs.readFile(new URL("../../twiller/src/components/Editprofile.tsx", import.meta.url), "utf8");
  assert.match(composer, /uploadMedia\(image, "image"\)/); assert.match(composer, /uploadMedia\(audioFile, "audio"\)/);
  assert.match(editor, /uploadMedia\(image, "image"\)/);
  for (const source of [composer, editor]) assert.doesNotMatch(source, /api\.imgbb\.com|97f3fb960c3520d6a88d7e29679cf96f|readAsDataURL/);
});
