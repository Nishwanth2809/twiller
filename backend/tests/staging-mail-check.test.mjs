import test from "node:test";
import assert from "node:assert/strict";
import { runMailDiagnostic } from "../scripts/staging-mail-check.mjs";

const env = {
  TWILLER_DEPLOYMENT_STAGE: "staging",
  TWILLER_MAIL_DIAGNOSTIC: "yes",
  TWILLER_MAIL_DIAGNOSTIC_RECIPIENT: "private-recipient@example.invalid",
  EMAIL_USER: "private-sender@example.invalid",
  EMAIL_PASS: "private-password",
};

function fixture({ verify = async () => true, sendMail = async options => ({ accepted: [options.to], rejected: [] }) } = {}) {
  const logs = [];
  const calls = { verify: 0, send: 0 };
  let settings;
  let message;
  return {
    calls, logs, settings: () => settings, message: () => message,
    options: {
      env,
      logger: { log: value => logs.push(value) },
      createTransport: options => {
        settings = options;
        return {
          verify: async () => { calls.verify++; return verify(); },
          sendMail: async options => { calls.send++; message = options; return sendMail(options); },
          close: () => {},
        };
      },
    },
  };
}

test("verify failure stops before send and logs only sanitized metadata", async () => {
  const sample = fixture({ verify: async () => {
    throw Object.assign(new Error(`private-password ${env.EMAIL_USER} ${env.TWILLER_MAIL_DIAGNOSTIC_RECIPIENT}`), {
      name: "private-password", code: "EAUTH", responseCode: 535,
      command: `AUTH ${env.EMAIL_PASS}`,
    });
  } });
  assert.equal(await runMailDiagnostic(sample.options), false);
  assert.deepEqual(sample.calls, { verify: 1, send: 0 });
  assert.deepEqual(JSON.parse(sample.logs[0]), {
    phase: "verify", success: false, name: "Error", code: "EAUTH",
    responseCode: 535, command: "AUTH", category: "AUTHENTICATION_REJECTED",
  });
  const output = sample.logs.join(" ");
  for (const secret of [env.EMAIL_USER, env.EMAIL_PASS, env.TWILLER_MAIL_DIAGNOSTIC_RECIPIENT]) {
    assert.equal(output.includes(secret), false);
  }
});

test("verify success sends exactly once with explicit sender and staging SMTP settings", async () => {
  const sample = fixture();
  assert.equal(await runMailDiagnostic(sample.options), true);
  assert.deepEqual(sample.calls, { verify: 1, send: 1 });
  assert.deepEqual(sample.logs.map(value => JSON.parse(value)), [
    { phase: "verify", success: true }, { phase: "send", success: true },
  ]);
  assert.equal(sample.message().from, env.EMAIL_USER);
  assert.equal(sample.message().to, env.TWILLER_MAIL_DIAGNOSTIC_RECIPIENT);
  assert.equal(sample.settings().host, "smtp.gmail.com");
  assert.equal(sample.settings().port, 465);
  assert.equal(sample.settings().secure, true);
  assert.equal(sample.settings().family, 4);
  assert.deepEqual(sample.settings().auth, { user: env.EMAIL_USER, pass: env.EMAIL_PASS });
  assert.equal(sample.settings().connectionTimeout, 10000);
});

test("staging and explicit diagnostic guards reject before creating a transport", async () => {
  for (const override of [{ TWILLER_DEPLOYMENT_STAGE: "production" }, { TWILLER_MAIL_DIAGNOSTIC: "no" }]) {
    const sample = fixture();
    assert.equal(await runMailDiagnostic({ ...sample.options, env: { ...env, ...override } }), false);
    assert.deepEqual(sample.calls, { verify: 0, send: 0 });
    assert.equal(sample.settings(), undefined);
  }
});

test("send failure logs sanitized category without raw SMTP response or recipient", async () => {
  const sample = fixture({ sendMail: async () => {
    throw Object.assign(new Error(`secret ${env.EMAIL_PASS}`), {
      code: "EENVELOPE", responseCode: 550,
      response: `550 rejected ${env.TWILLER_MAIL_DIAGNOSTIC_RECIPIENT}`,
      command: `MAIL FROM:<${env.EMAIL_USER}>`,
    });
  } });
  assert.equal(await runMailDiagnostic(sample.options), false);
  assert.deepEqual(sample.calls, { verify: 1, send: 1 });
  assert.deepEqual(JSON.parse(sample.logs[1]), {
    phase: "send", success: false, name: "Error", code: "EENVELOPE",
    responseCode: 550, command: "MAIL FROM", category: "ENVELOPE_REJECTED",
  });
  const output = sample.logs.join(" ");
  for (const secret of [env.EMAIL_USER, env.EMAIL_PASS, env.TWILLER_MAIL_DIAGNOSTIC_RECIPIENT, "550 rejected"]) {
    assert.equal(output.includes(secret), false);
  }
});
