import test from "node:test";
import assert from "node:assert/strict";
import { deliverEmail } from "../mail.js";

const message = { to: "fixture@example.invalid", subject: "Fixture", html: "private-proof-fixture" };
const secret = "fixture-server-secret-32-characters-long";
function setup(overrides = {}) {
  const events = []; let smtpCalls = 0;
  return {
    events, calls: () => smtpCalls,
    deps: {
      appsScriptUrl: "https://provider.invalid/private-endpoint",
      appsScriptSecret: secret,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }),
      sendSmtp: async options => { smtpCalls++; assert.deepEqual(options, message); return { accepted: [message.to], rejected: [] }; },
      logger: { error: (...args) => events.push(args) }, timeoutMs: 25,
      ...overrides,
    },
  };
}
test("Apps Script confirms success and skips fallback", async () => {
  const fixture = setup({fetchImpl: async (url, options) => {
    assert.equal(options.method, "POST"); assert.deepEqual(JSON.parse(options.body), {secret,mail:message});
    assert.equal(options.redirect, "manual");
    assert.ok(options.signal instanceof AbortSignal);
    return {ok:true,status:200,json:async()=>({success:true,internal:"never-returned"})};
  }});
  assert.deepEqual(await deliverEmail(message, fixture.deps), {provider:"apps_script",success:true});
  assert.equal(fixture.calls(), 0); assert.deepEqual(fixture.events, []);
});

test("Apps Script acknowledgement follows only Google's one-time HTTPS response URL", async () => {
  const calls = [];
  const fixture = setup({ sendSmtp: undefined, fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return {
      status: 302,
      headers: { get: name => name === "location" ? "https://script.googleusercontent.com/macros/echo?fixture=one-time" : null },
    };
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  }});
  assert.deepEqual(await deliverEmail(message, fixture.deps), { provider: "apps_script", success: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[1].options.method, "GET");
  assert.equal(calls[1].options.redirect, "error");
  assert.equal(calls[1].options.body, undefined);
  assert.equal(calls[1].options.signal, calls[0].options.signal);
  assert.equal(fixture.calls(), 0);
});

test("Unexpected Apps Script redirects cannot receive the secret or count as delivery", async () => {
  for (const location of ["https://other.example.invalid/ack", "http://script.googleusercontent.com/ack", "https://script.googleusercontent.com.evil.invalid/ack"]) {
    let calls = 0;
    const fixture = setup({ sendSmtp: undefined, fetchImpl: async () => {
      calls++;
      return { status: 302, headers: { get: () => location } };
    }});
    await assert.rejects(deliverEmail(message, fixture.deps), { code: "EMAIL_DELIVERY_FAILED" });
    assert.equal(calls, 1);
    assert.equal(fixture.events[0][1].reason, "INVALID_REDIRECT");
    assert.equal(JSON.stringify(fixture.events).includes(secret), false);
  }
});

test("Redirected negative acknowledgement and stalled response remain delivery failures", async () => {
  for (const { secondResponse, expectedReason } of [
    { secondResponse: { ok: true, status: 200, json: async () => ({ success: false }) }, expectedReason: "PROVIDER_REJECTED" },
    { secondResponse: new Promise(() => {}), expectedReason: "ACK_TIMEOUT" },
  ]) {
    let calls = 0;
    const fixture = setup({ sendSmtp: undefined, timeoutMs: 5, fetchImpl: async () => {
      calls++;
      return calls === 1
        ? { status: 302, headers: { get: () => "https://script.googleusercontent.com/macros/echo?fixture=one-time" } }
        : secondResponse;
    }});
    await assert.rejects(deliverEmail(message, fixture.deps), { code: "EMAIL_DELIVERY_FAILED" });
    assert.equal(calls, 2);
    assert.equal(fixture.events[0][1].reason, expectedReason);
  }
});

test("Apps Script receives only bounded allowlisted fields; caller From is ignored", async () => {
  const fixture=setup({fetchImpl:async (_url,options)=>{
    assert.deepEqual(JSON.parse(options.body),{secret,mail:message});
    assert.equal(options.headers["Content-Type"],"application/json");
    return {ok:true,status:200,json:async()=>({success:true})};
  }});
  assert.equal((await deliverEmail({...message,from:"attacker@example.invalid",cc:"other@example.invalid"},fixture.deps)).provider,"apps_script");
  assert.equal(fixture.calls(),0);
});

test("Apps Script requires a server secret and never leaks it through failures", async () => {
  const fixture=setup({appsScriptSecret:undefined,fetchImpl:async()=>{throw Error("unexpected request");}});
  await assert.rejects(deliverEmail(message,fixture.deps),{code:"EMAIL_DELIVERY_FAILED"});
  assert.equal(fixture.calls(),0);
  assert.equal(JSON.stringify(fixture.events).includes(secret),false);
  const rejected=setup({fetchImpl:async()=>{throw Error(secret);},sendSmtp:async()=>{throw Error(secret);}});
  await assert.rejects(deliverEmail(message,rejected.deps),{code:"EMAIL_DELIVERY_FAILED",message:"Email delivery is unavailable"});
  assert.equal(JSON.stringify(rejected.events).includes(secret),false);
});

test("invalid recipients and oversized content stop before either provider", async () => {
  for(const invalid of [
    {...message,to:"first@example.invalid,second@example.invalid"},
    {...message,to:"x".repeat(255)+"@example.invalid"},
    {...message,subject:"x".repeat(201)},
    {...message,subject:"Header\nInjection"},
    {...message,html:"x".repeat(49153)},
  ]) {
    const fixture=setup({fetchImpl:async()=>{throw Error("must not fetch");},sendSmtp:async()=>{throw Error("must not send");}});
    await assert.rejects(deliverEmail(invalid,fixture.deps),{code:"EMAIL_DELIVERY_FAILED"});
    assert.equal(fixture.calls(),0);
  }
});

test("SMTP uses only the configured sender, never caller-supplied From", async () => {
  const {smtpMailOptions}=await import("../mail.js");
  assert.deepEqual(smtpMailOptions({...message,from:"attacker@example.invalid"},"sender@example.invalid"),{
    ...message,from:{name:"Twiller",address:"sender@example.invalid"},
  });
  assert.throws(()=>smtpMailOptions(message,undefined),{code:"EMAIL_DELIVERY_FAILED"});
});
test("Apps Script HTTP failure uses successful SMTP fallback", async () => {
  const fixture = setup({fetchImpl:async()=>({ok:false,status:500,json:async()=>({success:true})})});
  assert.deepEqual(await deliverEmail(message,fixture.deps),{provider:"smtp",success:true});
  assert.equal(fixture.calls(),1);
  assert.deepEqual(fixture.events[0][1],{provider:"apps_script",reason:"HTTP_FAILURE",httpStatus:500});
});
test("Malformed and negative Apps Script acknowledgements cannot report success", async () => {
  for(const body of [null,[],{},"success",{success:"true"},{success:false}]) {
    const fixture=setup({fetchImpl:async()=>({ok:true,status:200,json:async()=>body})});
    assert.equal((await deliverEmail(message,fixture.deps)).provider,"smtp"); assert.equal(fixture.calls(),1);
  }
  const fixture=setup({fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError("private body");}})});
  assert.equal((await deliverEmail(message,fixture.deps)).provider,"smtp");
});
test("Timeout aborts both stalled request and stalled response body and falls back", async () => {
  for(const bodyStalls of [false,true]) {
    let signal;
    const fixture=setup({timeoutMs:5,fetchImpl:async (_url,options)=>{
      signal=options.signal;
      if(bodyStalls)return {ok:true,status:200,json:()=>new Promise(()=>{})};
      return new Promise(()=>{});
    }});
    assert.equal((await deliverEmail(message,fixture.deps)).provider,"smtp");
    assert.equal(signal.aborted,true); assert.equal(fixture.calls(),1);
    assert.equal(fixture.events[0][1].reason,"TIMEOUT");
  }
});
test("Network failure falls back without leaking provider details", async () => {
  const fixture=setup({fetchImpl:async()=>{throw new Error("private-proof-fixture fixture@example.invalid secret-provider-url");}});
  assert.equal((await deliverEmail(message,fixture.deps)).provider,"smtp");
  assert.equal(fixture.events[0][1].reason,"NETWORK_FAILURE");
  const logs=JSON.stringify(fixture.events);
  for(const secret of [message.to,message.html,"secret-provider-url","private-endpoint"])assert.equal(logs.includes(secret),false);
});
test("SMTP-only configuration preserves provider fallback and requires acceptance", async () => {
  const fixture=setup({appsScriptUrl:undefined,fetchImpl:async()=>{throw new Error("must not call");}});
  assert.deepEqual(await deliverEmail(message,fixture.deps),{provider:"smtp",success:true}); assert.equal(fixture.calls(),1);
  for(const info of [undefined,{}, {accepted:[],rejected:[message.to]}, {accepted:[message.to],rejected:["other@example.invalid"]}]) {
    const rejected=setup({appsScriptUrl:undefined,sendSmtp:async()=>info});
    await assert.rejects(deliverEmail(message,rejected.deps),{code:"EMAIL_DELIVERY_FAILED",message:"Email delivery is unavailable"});
  }
});
test("All providers failing yields a safe error and sanitized diagnostics", async () => {
  const fixture=setup({fetchImpl:async()=>({ok:false,status:503}),sendSmtp:async()=>{throw new Error("private SMTP credentials");}});
  await assert.rejects(deliverEmail(message,fixture.deps),{code:"EMAIL_DELIVERY_FAILED",message:"Email delivery is unavailable"});
  assert.equal(fixture.events.length,2); assert.equal(JSON.stringify(fixture.events).includes("credentials"),false);
});
test("Apps Script alone succeeds, and its failure is safe without SMTP on Render Free", async () => {
  const accepted=setup({sendSmtp:undefined});
  assert.deepEqual(await deliverEmail(message,accepted.deps),{provider:"apps_script",success:true});
  assert.equal(accepted.calls(),0);
  const rejected=setup({sendSmtp:undefined,fetchImpl:async()=>({ok:true,status:200,json:async()=>({success:false})})});
  await assert.rejects(deliverEmail(message,rejected.deps),{code:"EMAIL_DELIVERY_FAILED",message:"Email delivery is unavailable"});
  assert.equal(rejected.events.length,1);
  assert.deepEqual(rejected.events[0][1],{provider:"apps_script",reason:"PROVIDER_REJECTED",httpStatus:200});
});
