import mongoose from "mongoose";
const schema=new mongoose.Schema({_id:String,owner:{type:mongoose.Schema.Types.ObjectId,required:true},target:String,hash:{type:String,select:false},status:{type:String,enum:["pending","used"],default:"pending"},attempts:{type:Number,default:0},sentAt:Date,expiresAt:Date});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export default mongoose.model("Challenge",schema);
