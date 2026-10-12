import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";

const source = readFileSync(new URL("../../docs/apps-script-mailer.gs",import.meta.url),"utf8");
const secret = "fixture-server-secret-32-characters-long";
const mail = {to:"recipient@example.invalid",subject:"Twiller - Login verification",html:"<p>Private fixture</p>"};

function harness({property=secret,sendEmail=()=>{}}={}) {
  const sent=[];
  const context={
    ContentService:{MimeType:{JSON:"json"},createTextOutput(value){return {value,setMimeType(type){this.type=type;return this;}};}},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>property})},
    Utilities:{DigestAlgorithm:{SHA_256:"sha256"},Charset:{UTF_8:"utf8"},
      computeDigest:(_algorithm,value)=>[...createHash("sha256").update(value).digest()],
      newBlob:value=>({getBytes:()=>[...Buffer.from(value,"utf8")]})},
    MailApp:{sendEmail:options=>{sent.push(options);sendEmail(options);}},
  };
  vm.runInNewContext(source,context);
  const post=body=>context.doPost({contentLength:Buffer.byteLength(body),postData:{type:"application/json",contents:body}});
  return {post,sent,context};
}

test("valid authenticated POST sends exactly once and acknowledges after MailApp returns",()=>{
  const fixture=harness();
  const response=fixture.post(JSON.stringify({secret,mail}));
  assert.deepEqual(JSON.parse(response.value),{success:true});
  assert.equal(response.type,"json");
  assert.equal(fixture.sent.length,1);
  assert.equal(fixture.sent[0].to,mail.to);
  assert.equal(fixture.sent[0].subject,mail.subject);
  assert.equal(fixture.sent[0].htmlBody,mail.html);
  assert.equal(Object.hasOwn(fixture.sent[0],"from"),false);
  assert.equal(fixture.context.doGet,undefined);
});

test("missing or wrong secret and malformed requests never send",()=>{
  const fixture=harness();
  for(const body of [
    "not json",JSON.stringify({mail}),JSON.stringify({secret:"wrong",mail}),
    JSON.stringify({secret,mail:{...mail,from:"attacker@example.invalid"}}),
    JSON.stringify({secret,mail:{...mail,to:"one@example.invalid,two@example.invalid"}}),
    JSON.stringify({secret,mail:{...mail,subject:"Bad\nSubject"}}),
    JSON.stringify({secret,mail:{...mail,html:"x".repeat(49153)}}),
    JSON.stringify({secret,mail,extra:"arbitrary"}),
    "x".repeat(65537),
  ]) assert.deepEqual(JSON.parse(fixture.post(body).value),{success:false});
  assert.equal(fixture.sent.length,0);
  const noProperty=harness({property:null});
  assert.deepEqual(JSON.parse(noProperty.post(JSON.stringify({secret,mail})).value),{success:false});
  assert.equal(noProperty.sent.length,0);
});

test("MailApp failure returns only a negative acknowledgement and never logs private content",()=>{
  const fixture=harness({sendEmail:()=>{throw Error(`private ${secret} ${mail.to} ${mail.html}`);}});
  const response=fixture.post(JSON.stringify({secret,mail}));
  assert.deepEqual(JSON.parse(response.value),{success:false});
  for(const privateValue of [secret,mail.to,mail.html])assert.equal(response.value.includes(privateValue),false);
});
