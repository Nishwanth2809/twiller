import User from "./models/user.js";
import Conversation from "./models/conversation.js";
import Subscription from "./models/subscription.js";
import LoginSession from "./models/loginSession.js";
import Message from "./models/message.js";
import Tweet from "./models/tweet.js";
import Challenge from "./models/challenge.js";
import Throttle from "./models/throttle.js";
import Media from "./models/media.js";
import Notification from "./models/notification.js";
import Topic from "./models/topic.js";
import TopicFollow from "./models/topicFollow.js";
import Circle from "./models/circle.js";
import CircleMembership from "./models/circleMembership.js";
import FeedRule from "./models/feedRule.js";
import { RESERVED } from "./handles.js";

export async function auditIntegrity() {
  const [handles,pairs,invalidUsers,invalidPairs,missingPairs,duplicateEmails,duplicateUids]=await Promise.all([
    User.aggregate([{$group:{_id:{$toLower:{$convert:{input:"$username",to:"string",onError:"",onNull:""}}},n:{$sum:1}}},{$match:{n:{$gt:1}}},{$count:"n"}]),
    Conversation.aggregate([{$unwind:"$participants"},{$sort:{participants:1}},{$group:{_id:"$_id",ids:{$push:"$participants"}}},{$group:{_id:"$ids",n:{$sum:1}}},{$match:{n:{$gt:1}}},{$count:"n"}]),
    User.countDocuments({$or:[{username:{$not:/^[a-z0-9_]{3,50}$/}},{username:{$exists:false}},{username:{$in:[...RESERVED]}}]}),
    Conversation.countDocuments({$expr:{$ne:[{$size:{$ifNull:["$participants",[]]}},2]}}),
    Conversation.countDocuments({pairKey:{$exists:false}}),
    User.aggregate([{$group:{_id:{$toLower:{$convert:{input:"$email",to:"string",onError:"",onNull:""}}},n:{$sum:1}}},{$match:{n:{$gt:1}}},{$count:"n"}]),
    User.aggregate([{$match:{firebaseUid:{$type:"string"}}},{$group:{_id:"$firebaseUid",n:{$sum:1}}},{$match:{n:{$gt:1}}},{$count:"n"}]),
  ]);
  return {duplicateHandles:handles[0]?.n||0,duplicatePairs:pairs[0]?.n||0,invalidUsers,invalidPairs,missingPairs,duplicateEmails:duplicateEmails[0]?.n||0,duplicateUids:duplicateUids[0]?.n||0};
}
export async function prepareIndexes(production) {
  const audit=await auditIntegrity();
  if(Object.values(audit).some(Boolean))throw Error("Phase 2 identity/conversation audit requires reconciliation before constraints");
  const models=[User,Subscription,LoginSession,Conversation,Message,Tweet,Challenge,Throttle,Media,Notification,Topic,TopicFollow,Circle,CircleMembership,FeedRule];
  if(!production) { for(const model of models)await model.createIndexes(); return; }
  // Production startup: verify schema-defined indexes exist in Atlas
  for(const model of models) {
    const indexes=await model.collection.indexes();
    for(const [key,options] of model.schema.indexes()) {
      const match=indexes.find(i=>JSON.stringify(i.key)===JSON.stringify(key));
      if(!match) {
        // Index completely missing — this is a hard error
        throw Error(`Required index missing on ${model.modelName}: ${JSON.stringify(key)}; review STAGING_DEPLOYMENT.md for the guarded staging index procedure or use an approved production migration`);
      }
      // Warn on incompatibilities but don't block startup
      if(!!match.unique!==!!options.unique) {
        if ([Topic, TopicFollow, Circle, CircleMembership, FeedRule].includes(model)) throw Error(`Required uniqueness constraint missing on ${model.modelName}`);
        console.warn(`⚠️  Index uniqueness mismatch on ${model.modelName}: ${JSON.stringify(key)}`);
      }
    }
  }
}
