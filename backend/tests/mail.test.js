import test from "node:test";
import assert from "node:assert/strict";
import { deliverEmail } from "../mail.js";

const message = { to: "fixture@example.invalid", subject: "Fixture", html: "private-proof-fixture" };
function setup(overrides = {}) {
  const events = []; let smtpCalls = 0;
  return {
    events, calls: () => smtpCalls,
    deps: {
      appsScriptUrl: "https://provider.invalid/private-endpoint",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }),
      sendSmtp: async options => { smtpCalls++; assert.equal(options, message); return { accepted: [message.to], rejected: [] }; },
      logger: { error: (...args) => events.push(args) }, timeoutMs: 25,
      ...overrides,
    },
  };
}
test("Apps Script confirms success and skips fallback", async () => {
  const fixture = setup({fetchImpl: async (url, options) => {
    assert.equal(options.method, "POST"); assert.deepEqual(JSON.parse(options.body), message);
    assert.ok(options.signal instanceof AbortSignal);
    return {ok:true,status:200,json:async()=>({success:true,internal:"never-returned"})};
  }});
  assert.deepEqual(await deliverEmail(message, fixture.deps), {provider:"apps_script",success:true});
  assert.equal(fixture.calls(), 0); assert.deepEqual(fixture.events, []);
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
