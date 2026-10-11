import User from "./models/user.js";
import Tweet from "./models/tweet.js";
import Media from "./models/media.js";
import { transaction, consumeQuota } from "./quota.js";
import { attachMedia } from "./media.js";
import { checkChallenge, consumeChallenge } from "./challenges.js";
import { fail, PUBLIC_USER_FIELDS, validTopicIds } from "./security.js";
import Topic, { TOPIC_FIELDS } from "./models/topic.js";
import Circle, { CIRCLE_FIELDS } from "./models/circle.js";
import CircleMembership from "./models/circleMembership.js";
import { addNotifications } from "./notification-operations.js";

export async function createPost(owner,input,parentId) {
  const topicIds = input.topicIds === undefined ? [] : input.topicIds;
  if (!validTopicIds(topicIds) || parentId && topicIds.length) fail(400, "INVALID_TOPICS", "Choose up to three distinct topics for a top-level post");
  if (parentId && input.circleId) fail(400, "INVALID_CIRCLE", "Circle assignment is only available for top-level posts");
  const proof=input.audio ? await checkChallenge(owner,"audio","audio",input.audioOtp) : null;
  if(input.audio) {
    const hour=new Date(Date.now()+5.5*3600000).getUTCHours();
    if(hour<14||hour>=19)fail(403,"AUDIO_WINDOW","Audio posts are allowed between 2 PM and 7 PM IST");
  }
  const result=await transaction(async session=>{
    if (topicIds.length && await Topic.countDocuments({ _id: { $in: topicIds }, status: "active" }).session(session) !== topicIds.length) fail(400, "INVALID_TOPICS", "One or more selected topics are unavailable");
    if (input.circleId) {
      if (!await Circle.exists({ _id: input.circleId, status: "active", visibility: "public" }).session(session)) fail(400, "INVALID_CIRCLE", "Circle is unavailable");
      if (!await CircleMembership.exists({ circle: input.circleId, user: owner }).session(session)) fail(403, "CIRCLE_MEMBERSHIP_REQUIRED", "Join this Circle before posting");
    }
    if(parentId) {
      const changed=await Tweet.updateOne({_id:parentId,deletedAt:null},{$inc:{comments:1}},{session});
      if(changed.modifiedCount!==1)fail(404,"NOT_FOUND","Parent post unavailable");
    }
    await consumeQuota(User,owner,session);
    await attachMedia(input.image,"image",owner,session);
    await attachMedia(input.audio,"audio",owner,session);
    if(proof)await consumeChallenge(proof,session);
    const [post]=await Tweet.create([{author:owner,content:input.content,image:input.image||null,audio:input.audio||null,parentId:parentId||null,topics:topicIds,circle:input.circleId||null}],{session});
    const notices = [];
    if (parentId) {
      const parent = await Tweet.findById(parentId).select("author").session(session);
      if (parent && String(parent.author) !== String(owner)) notices.push({ recipient: parent.author, actor: owner, type: "reply", post: post._id });
    }
    const handles = [...new Set([...String(input.content || "").matchAll(/(?:^|\s)@([a-z0-9_]{3,50})/gi)].map(match => match[1].toLowerCase()))];
    if (handles.length) {
      const mentioned = await User.find({ username: { $in: handles }, _id: { $ne: owner } }).select("_id").session(session);
      for (const recipient of mentioned) notices.push({ recipient: recipient._id, actor: owner, type: "mention", post: post._id });
    }
    if (notices.length) await addNotifications(notices, session);
    return post;
  });
  return result.populate([{ path: "author", select: PUBLIC_USER_FIELDS }, { path: "topics", select: TOPIC_FIELDS, match: { status: "active" } }, { path: "circle", select: CIRCLE_FIELDS, match: { status: "active" } }]);
}
export async function deletePost(owner,id) {
  await transaction(async session=>{
    const post=await Tweet.findById(id).session(session);
    if(!post) return;
    if(String(post.author)!==String(owner))fail(403,"FORBIDDEN","Only the author can delete this post");
    if(post.deletedAt)return;
    const children=await Tweet.exists({parentId:id}).session(session);
    if(children)await Tweet.updateOne({_id:id},{$set:{deletedAt:new Date(),content:"",image:null,audio:null,likes:0,retweets:0,likedBy:[],retweetedBy:[]}},{session});
    else await Tweet.deleteOne({_id:id},{session});
    if(post.parentId)await Tweet.updateOne({_id:post.parentId,comments:{$gt:0}},{$inc:{comments:-1}},{session});
    await User.updateMany({bookmarks:id},{$pull:{bookmarks:id}},{session});
    for(const url of [post.image,post.audio].filter(Boolean)) {
      const base=process.env.MEDIA_PUBLIC_BASE_URL||"http://localhost:5000";
      const mediaId=typeof url==="string"&&url.startsWith(base+"/media/")?url.slice((base+"/media/").length):"";
      if(!/^[a-f\d]{24}$/i.test(mediaId))continue;
      const stillReferenced=await Tweet.exists({_id:{$ne:id},$or:[{image:url},{audio:url}]}).session(session);
      if(!stillReferenced)await Media.updateOne({_id:mediaId},{$set:{published:false}},{session});
    }
  });
  return {success:true};
}
export async function follow(owner,target,remove=false) {
  if(String(owner)===String(target))fail(400,"INVALID_INPUT","Cannot follow yourself");
  return transaction(async session=>{
    const [targetUser,currentUser]=await Promise.all([User.findById(target).select("_id").session(session),User.findById(owner).select("following").session(session)]);
    if(!targetUser||!currentUser)fail(404,"NOT_FOUND","Account not found");
    const alreadyFollowing=currentUser.following.some(id=>String(id)===String(target));
    const op=remove?"$pull":"$addToSet";
    const current=await User.findOneAndUpdate({_id:owner},{[op]:{following:target}},{session,new:true});
    if(!current)fail(404,"NOT_FOUND","Account not found");
    await User.updateOne({_id:target},{[op]:{followers:owner}},{session});
    if(!remove&&!alreadyFollowing)await addNotifications([{recipient:target,actor:owner,type:"follow"}],session);
    return {success:true,following:current.following};
  });
}
