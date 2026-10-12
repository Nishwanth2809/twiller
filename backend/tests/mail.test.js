import test from "node:test";
import assert from "node:assert/strict";
import { deliverEmail, resendMailOptions, smtpMailOptions } from "../mail.js";

const message = { to: "fixture@example.invalid", subject: "Fixture", html: "private-otp-and-reset-link" };
const key = "private-resend-api-key";
const sender = "Twiller <noreply@example.invalid>";
function setup(overrides = {}) {
  const events = []; const sent = [];
  return {
    events, sent,
    deps: {
      resendApiKey: key, mailFrom: sender,
      sendResend: async options => { sent.push(["resend", options]); return { data: { id: "provider-ack" }, error: null }; },
      logger: { error: (...args) => events.push(args) },
      ...overrides,
    },
  };
}

test("Resend receives only bounded fields and server-controlled sender", async () => {
  const fixture = setup();
  assert.deepEqual(await deliverEmail({ ...message, from: "attacker@example.invalid", cc: "other@example.invalid" }, fixture.deps),
    { provider: "resend", success: true });
  assert.deepEqual(fixture.sent, [["resend", { ...message, from: sender }]]);
  assert.deepEqual(fixture.events, []);
  assert.deepEqual(resendMailOptions(message, sender), { ...message, from: sender });
  assert.deepEqual(smtpMailOptions(message, "sender@example.invalid"),
    { ...message, from: { name: "Twiller", address: "sender@example.invalid" } });
});

test("invalid recipients, content and sender fail before any provider request", async () => {
  for (const invalid of [
    { ...message, to: "first@example.invalid,second@example.invalid" },
    { ...message, to: "x".repeat(255) + "@example.invalid" },
    { ...message, subject: "x".repeat(201) },
    { ...message, subject: "Header\nInjection" },
    { ...message, html: "x".repeat(49153) },
  ]) {
    const fixture = setup();
    await assert.rejects(deliverEmail(invalid, fixture.deps), { code: "EMAIL_DELIVERY_FAILED" });
    assert.equal(fixture.sent.length, 0);
  }
  for (const badSender of [undefined, "", "a@example.invalid\nBcc: victim@example.invalid", "not-an-address"]) {
    const fixture = setup({ mailFrom: badSender });
    await assert.rejects(deliverEmail(message, fixture.deps), { code: "EMAIL_DELIVERY_FAILED" });
    assert.equal(fixture.sent.length, 0);
  }
});

test("Resend provider rejection is safe and optionally falls back to SMTP", async () => {
  const fixture = setup({
    sendResend: async () => ({ data: null, error: { name: "validation_error", message: `${key} ${message.html}`, statusCode: 422 } }),
  });
  await assert.rejects(deliverEmail(message, fixture.deps),
    { code: "EMAIL_DELIVERY_FAILED", message: "Email delivery is unavailable" });
  assert.deepEqual(fixture.events[0][1], { provider: "resend", reason: "PROVIDER_REJECTED", httpStatus: 422 });
  const fallback = setup({
    sendResend: async () => ({ data: null, error: { statusCode: 500 } }),
    sendSmtp: async options => { assert.deepEqual(options, message); return { accepted: [message.to], rejected: [] }; },
  });
  assert.deepEqual(await deliverEmail(message, fallback.deps), { provider: "smtp", success: true });
});

test("Resend network failure, missing acknowledgement and all-provider failure never leak secrets", async () => {
  const privateReset = "https://example.invalid/reset?oobCode=private-reset-link";
  for (const sendResend of [
    async () => { throw new Error(`${key} ${message.html} ${privateReset}`); },
    async () => ({ data: {}, error: null }),
  ]) {
    const fixture = setup({ sendResend, sendSmtp: async () => { throw new Error(key); } });
    await assert.rejects(deliverEmail(message, fixture.deps), { code: "EMAIL_DELIVERY_FAILED" });
    const logs = JSON.stringify(fixture.events);
    for (const secret of [key, message.to, message.html, privateReset]) assert.equal(logs.includes(secret), false);
    assert.equal(fixture.events.length, 2);
  }
});

test("SMTP-only remains optional and requires provider acceptance", async () => {
  const fixture = setup({ resendApiKey: undefined, sendSmtp: async () => ({ accepted: [message.to], rejected: [] }) });
  assert.deepEqual(await deliverEmail(message, fixture.deps), { provider: "smtp", success: true });
  for (const info of [undefined, {}, { accepted: [], rejected: [message.to] }, { accepted: [message.to], rejected: ["other@example.invalid"] }]) {
    const rejected = setup({ resendApiKey: undefined, sendSmtp: async () => info });
    await assert.rejects(deliverEmail(message, rejected.deps), { code: "EMAIL_DELIVERY_FAILED" });
  }
  await assert.rejects(deliverEmail(message, setup({ resendApiKey: undefined }).deps), { code: "EMAIL_DELIVERY_FAILED" });
});
