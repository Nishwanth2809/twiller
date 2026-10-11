import Tweet from "./models/tweet.js";
import User from "./models/user.js";
import mongoose from "mongoose";
import { transaction } from "./quota.js";
import { PUBLIC_USER_FIELDS, fail } from "./security.js";
import { addNotifications } from "./notification-operations.js";
export async function toggleReaction(id,owner,kind) {
  const member=kind==="like"?"likedBy":"retweetedBy",count=kind==="like"?"likes":"retweets";
  const principal=new mongoose.Types.ObjectId(String(owner));
  const post=await transaction(async session=>{
    const current=await Tweet.findOne({_id:id,deletedAt:null}).session(session);
    if(!current)fail(404,"NOT_FOUND","Post unavailable");
    const adding=!current[member].some(value=>String(value)===String(principal));
    if(adding)current[member].addToSet(principal);else current[member].pull(principal);
    current[count]=current[member].length;
    await current.save({session});
    if(adding&&String(current.author)!==String(owner))await addNotifications([{recipient:current.author,actor:owner,type:kind==="like"?"like":"repost",post:current._id}],session);
    return current;
  });
  return post.populate("author",PUBLIC_USER_FIELDS);
}
export async function toggleBookmark(id,owner) {
  return transaction(async session=>{
    const post=await Tweet.updateOne({_id:id,deletedAt:null},{$inc:{__v:1}},{session});
    if(post.modifiedCount!==1)fail(404,"NOT_FOUND","Post unavailable");
    const user=await User.findById(owner).session(session);const present=user.bookmarks.map(String).includes(id);
    const updated=await User.findOneAndUpdate({_id:owner},{[present?"$pull":"$addToSet"]:{bookmarks:id}},{session,new:true});
    return {bookmarked:!present,bookmarks:updated.bookmarks};
  });
}
