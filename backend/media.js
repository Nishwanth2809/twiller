import sharp from "sharp";
import path from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import Media from "./models/media.js";
import { fail } from "./security.js";

export const IMAGE_MAX = 5 * 1024 * 1024;
export const AUDIO_MAX = 10 * 1024 * 1024;
// Entire MPEG frame stream / PCM WAV structure is checked; caller duration is ignored.
export function audioMetadata(buffer) {
  if (buffer.toString("ascii",0,4) === "RIFF" && buffer.toString("ascii",8,12) === "WAVE") {
    if (buffer.length < 44 || buffer.readUInt32LE(4) + 8 !== buffer.length) fail(400,"INVALID_MEDIA","Invalid WAV file");
    let offset=12, format, dataBytes=0;
    while(offset+8 <= buffer.length) {
      const kind=buffer.toString("ascii",offset,offset+4), size=buffer.readUInt32LE(offset+4); offset+=8;
      if(offset+size>buffer.length) fail(400,"INVALID_MEDIA","Truncated WAV file");
      if(kind === "fmt ") {
        if(size<16 || format) fail(400,"INVALID_MEDIA","Invalid WAV format");
        format={codec:buffer.readUInt16LE(offset),channels:buffer.readUInt16LE(offset+2),rate:buffer.readUInt32LE(offset+4),bytesPerSecond:buffer.readUInt32LE(offset+8),block:buffer.readUInt16LE(offset+12),bits:buffer.readUInt16LE(offset+14)};
      }
      if(kind === "data") dataBytes+=size;
      offset+=size+(size%2);
    }
    if(offset!==buffer.length || !format || format.codec!==1 || ![1,2].includes(format.channels) || ![8,16,24,32].includes(format.bits) || format.rate<8000 || format.rate>96000 || format.block!==format.channels*format.bits/8 || format.bytesPerSecond!==format.rate*format.block || dataBytes===0 || dataBytes%format.block) fail(400,"INVALID_MEDIA","Unsupported WAV encoding");
    return {mime:"audio/wav",duration:dataBytes/format.bytesPerSecond,extension:"wav"};
  }
  let offset=0, seconds=0, frames=0;
  if(buffer.toString("ascii",0,3)==="ID3") {
    if(buffer.length<10 || ![2,3,4].includes(buffer[3]) || buffer.subarray(6,10).some(v=>v>127)) fail(400,"INVALID_MEDIA","Invalid MP3 metadata");
    const size=buffer[6]*2097152+buffer[7]*16384+buffer[8]*128+buffer[9];
    offset=10+size+(buffer[3]===4 && buffer[5]&16 ? 10 : 0);
  }
  const end=buffer.length>=128 && buffer.toString("ascii",buffer.length-128,buffer.length-125)==="TAG" ? buffer.length-128 : buffer.length;
  while(offset+4<=end) {
    const word=buffer.readUInt32BE(offset), version=(word>>>19)&3, layer=(word>>>17)&3, bitrateIndex=(word>>>12)&15, rateIndex=(word>>>10)&3;
    if((word>>>21)!==2047 || version===1 || layer!==1 || !bitrateIndex || bitrateIndex===15 || rateIndex===3) fail(400,"INVALID_MEDIA","Invalid MP3 frame");
    const bitrates=version===3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
    const rate=[44100,48000,32000][rateIndex]/(version===3?1:version===2?2:4);
    const length=Math.floor((version===3?144:72)*bitrates[bitrateIndex]*1000/rate)+((word>>>9)&1);
    if(offset+length>end || length<4) fail(400,"INVALID_MEDIA","Truncated MP3 frame");
    seconds+=(version===3?1152:576)/rate; frames++; offset+=length;
  }
  if(offset!==end || frames<2) fail(400,"INVALID_MEDIA","Unsupported audio file");
  return {mime:"audio/mpeg",duration:seconds,extension:"mp3"};
}
export async function validateMedia(buffer, kind) {
  if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>(kind==="image"?IMAGE_MAX:AUDIO_MAX)) fail(413,"MEDIA_LIMIT","Media file exceeds the upload limit");
  if(kind==="audio") {
    const metadata=audioMetadata(buffer);
    if(!Number.isFinite(metadata.duration)||metadata.duration<=0||metadata.duration>300) fail(400,"MEDIA_DURATION","Audio must be at most five minutes");
    return {buffer,...metadata};
  }
  try {
    const image=sharp(buffer,{limitInputPixels:20000000,failOn:"warning"});
    const metadata=await image.metadata();
    if(!["jpeg","png","webp"].includes(metadata.format)||metadata.pages>1) throw Error();
    // Decode/re-encode strips arbitrary trailing content and embedded metadata.
    const sanitized=await image.rotate().jpeg({quality:85}).toBuffer();
    if(sanitized.length>IMAGE_MAX) throw Error();
    return {buffer:sanitized,mime:"image/jpeg",extension:"jpg"};
  } catch { fail(400,"INVALID_MEDIA","Choose a valid JPEG, PNG or WebP image"); }
}
export function mediaUrl(id) { return `${process.env.MEDIA_PUBLIC_BASE_URL || "http://localhost:5000"}/media/${id}`; }
export function mediaDirectory() { return path.resolve(process.env.MEDIA_DIR || "./media-storage"); }
export async function storeMedia(buffer,kind,owner) {
  const validated=await validateMedia(buffer,kind);
  const record=new Media({owner,kind,mime:validated.mime,bytes:validated.buffer.length,duration:validated.duration});
  record.filename=`${record._id}.${validated.extension}`;
  await mkdir(mediaDirectory(),{recursive:true}); const destination=path.join(mediaDirectory(),record.filename);
  try { await writeFile(destination,validated.buffer,{flag:"wx"}); await record.save(); }
  catch(error) { await unlink(destination).catch(()=>{}); throw error; }
  return {id:String(record._id),url:mediaUrl(record._id),kind,mime:record.mime,bytes:record.bytes,duration:record.duration};
}
export async function attachMedia(url,kind,owner,session) {
  if(!url) return null;
  const base=process.env.MEDIA_PUBLIC_BASE_URL || "http://localhost:5000";
  if(typeof url!=="string" || !url.startsWith(base+"/media/")) fail(400,"INVALID_MEDIA","Use a verified upload");
  const id=url.slice((base+"/media/").length);
  if(!/^[a-f\d]{24}$/.test(id)) fail(400,"INVALID_MEDIA","Invalid upload reference");
  const media=await Media.findOne({_id:id,owner,kind}).session(session);
  if(!media) fail(403,"MEDIA_FORBIDDEN","Upload does not belong to this account");
  await Media.updateOne({_id:id},{$set:{published:true}},{session});
  return media;
}
