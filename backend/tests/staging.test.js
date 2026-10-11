import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateConfiguration } from "../config.js";

const staging = {
  NODE_ENV: "production",
  TWILLER_DEPLOYMENT_STAGE: "staging",
  MONGODB_URI: "mongodb+srv://example:example@cluster.example.mongodb.net/twiller_staging",
  FIREBASE_PROJECT_ID: "twiller-staging-example",
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "twiller-staging-example", client_email: "admin@twiller-staging-example.iam.gserviceaccount.com", private_key: "test-only" }),
  FRONTEND_ORIGINS: "https://twiller-staging.example.test",
  MEDIA_PUBLIC_BASE_URL: "https://twiller-staging-api.example.test",
  MEDIA_DIR: "/var/data/media",
  APPS_SCRIPT_URL: "https://script.example.test/mail",
};

test("staging backend accepts a separate Atlas database and matching Firebase project", () => {
  assert.equal(validateConfiguration(staging).production, true);
});

test("staging backend fails closed on live database, Firebase, emulator, or missing credentials", () => {
  const bad = [
    { MONGODB_URI: "mongodb+srv://example:example@cluster.example.mongodb.net/production" },
    { MONGODB_URI: "mongodb+srv://example:example@cluster.example.test/twiller_staging" },
    { MONGODB_URI: "mongodb://127.0.0.1:27017/twiller_staging" },
    { FIREBASE_PROJECT_ID: "twill-12669" },
    { FIREBASE_PROJECT_ID: "demo-twiller-local" },
    { FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "another-project" }) },
    { FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "twiller-staging-example", client_email: "admin@twill-12669.iam.gserviceaccount.com", private_key: "test-only" }) },
    { FIREBASE_SERVICE_ACCOUNT: undefined },
    { FRONTEND_ORIGINS: "https://twiller-ruby.vercel.app" },
    { MEDIA_PUBLIC_BASE_URL: "http://localhost:5000" },
    { NODE_ENV: "development" },
    { MONOGDB_URL: "mongodb+srv://example:example@cluster.example.mongodb.net/production" },
  ];
  for (const change of bad) assert.throws(() => validateConfiguration({ ...staging, ...change }));
});

test("Vercel Preview Firebase config requires an explicit independent real project", () => {
  const require = createRequire(new URL("../../twiller/package.json", import.meta.url));
  const ts = require("typescript");
  const source = readFileSync(new URL("../../twiller/src/lib/firebase-config.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(module,exports){${compiled}\n})`)(module, module.exports);
  const { firebaseWebConfig } = module.exports;
  const values = {
    apiKey: "test-public-key", authDomain: "twiller-staging-example.firebaseapp.com",
    projectId: "twiller-staging-example", storageBucket: "twiller-staging-example.firebasestorage.app",
    messagingSenderId: "123", appId: "test-app",
  };
  const live = { ...values, projectId: "twill-12669", authDomain: "twill-12669.firebaseapp.com" };
  assert.equal(firebaseWebConfig("staging", values, live, "preview").projectId, values.projectId);
  assert.throws(() => firebaseWebConfig(undefined, values, live, "preview"));
  assert.throws(() => firebaseWebConfig("staging", { ...values, projectId: "twill-12669" }, live, "preview"));
  assert.throws(() => firebaseWebConfig("staging", { ...values, appId: undefined }, live, "preview"));
  assert.throws(() => firebaseWebConfig("staging", { ...values, authDomain: "twill-12669.firebaseapp.com" }, live, "preview"));
  assert.equal(firebaseWebConfig(undefined, {}, live, undefined).projectId, "twill-12669");
});

test("staging index setup refuses to run without the explicit operator switches", () => {
  const env = { ...process.env, TWILLER_DEPLOYMENT_STAGE: "staging", TWILLER_STAGING_INDEXES: "CREATE", TWILLER_STAGING_BACKUP_CONFIRMED: "no", MONGODB_URI: staging.MONGODB_URI };
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/staging-indexes.mjs", import.meta.url))], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing index setup/);
});
