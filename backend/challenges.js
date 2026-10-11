import crypto from "node:crypto";
import Challenge from "./models/challenge.js";
import Throttle from "./models/throttle.js";
import { fail } from "./security.js";
const digest=value=>crypto.createHash("sha256").update(value).digest("hex");
export async function rateLimit(key,limit=6,windowMs=3600000) {
  const now=Date.now(),bucket=Math.floor(now/windowMs),expiresAt=new Date((bucket+1)*windowMs);
  const id=digest(`${key}:${bucket}`);let row;
  try {row=await Throttle.findOneAndUpdate({_id:id},{$inc:{count:1},$setOnInsert:{expiresAt}},{upsert:true,new:true});}
  catch(error){if(error.code!==11000)throw error;row=await Throttle.findOneAndUpdate({_id:id},{$inc:{count:1}},{new:true});}
  if(row.count>limit)fail(429,"THROTTLED","Too many requests. Please retry later");
}
export async function issueChallenge(owner,purpose,target,send) {
  const key=`${owner._id}:${purpose}`, now=new Date();
  const existing=await Challenge.findById(key);
  if(existing?.status==="pending"&&existing.expiresAt>now) {
    if(existing.target!==target)fail(409,"CHALLENGE_PENDING","Complete or wait for the current verification before changing its target");
    return {pending:true,expiresAt:existing.expiresAt};
  }
  await rateLimit(`challenge:${key}`); const otp=crypto.randomInt(100000,1000000).toString();
  const hash=digest(`${key}:${otp}`), expiresAt=new Date(Date.now()+600000);
  try {await Challenge.findOneAndUpdate({_id:key,$or:[{expiresAt:{$lte:now}},{status:"used"},{expiresAt:{$exists:false}}]},{$set:{owner:owner._id,target,hash,status:"pending",attempts:0,sentAt:now,expiresAt}},{upsert:true,new:true});}
  catch(error){if(error.code!==11000)throw error;fail(409,"CHALLENGE_PENDING","A verification request is already pending");}
  try {await send(otp);} catch {await Challenge.deleteOne({_id:key,hash});fail(503,"DELIVERY_FAILED","We could not send the verification email. Please retry");}
  return {pending:true,expiresAt};
}
export async function checkChallenge(owner,purpose,target,otp) {
  const key=`${owner}:${purpose}`, hash=digest(`${key}:${otp}`);
  const current=await Challenge.findById(key).select("+hash");
  if(!current||current.status!=="pending"||current.expiresAt<=new Date()||current.attempts>=5)fail(400,"INVALID_OTP","Invalid, expired or exhausted verification code");
  if(current.hash!==hash||current.target!==target) {
    await Challenge.updateOne({_id:key,status:"pending",attempts:{$lt:5}},{$inc:{attempts:1}});
    fail(400,"INVALID_OTP","Invalid, expired or exhausted verification code");
  }
  return {key,hash};
}
export async function consumeChallenge(proof,session) {
  const changed=await Challenge.updateOne({_id:proof.key,hash:proof.hash,status:"pending",attempts:{$lt:5},expiresAt:{$gt:new Date()}},{$set:{status:"used"},$unset:{hash:1}},{session});
  if(changed.modifiedCount!==1)fail(400,"INVALID_OTP","Verification code is no longer valid");
}
