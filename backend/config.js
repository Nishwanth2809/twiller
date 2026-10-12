import { fail } from "./security.js";
function origin(value) { const url=new URL(value); if(!["http:","https:"].includes(url.protocol)||url.origin!==value)throw Error("Origins must have no path");return value; }
export function firebaseAuthEmulatorConfig(env=process.env) {
  const enabled=env.TWILLER_LOCAL_AUTH_EMULATOR==="true";
  const host=env.FIREBASE_AUTH_EMULATOR_HOST;
  if(!enabled) {
    if(host)throw Error("FIREBASE_AUTH_EMULATOR_HOST requires TWILLER_LOCAL_AUTH_EMULATOR=true");
    return null;
  }
  if(!["development","test"].includes(env.NODE_ENV))throw Error("Local Firebase Auth Emulator is limited to development/test mode");
  const match=typeof host==="string"&&host.match(/^(localhost|127\.0\.0\.1):(\d{1,5})$/);
  if(!match||Number(match[2])<1||Number(match[2])>65535)throw Error("Firebase Auth Emulator must use an explicit loopback host and port");
  const projectId=env.FIREBASE_PROJECT_ID;
  if(typeof projectId!=="string"||!/^demo-[a-z0-9-]{1,29}$/.test(projectId))throw Error("Local Firebase Auth Emulator requires a demo-* Firebase project ID");
  return {host,projectId};
}
export function corsOrigins(env=process.env) {
  const origins=(env.FRONTEND_ORIGINS||"https://twiller-ruby.vercel.app").split(",").filter(Boolean).map(origin);
  const previews=(env.PREVIEW_ORIGINS||"").split(",").filter(Boolean).map(origin);
  return new Set([...origins,...previews,...(env.NODE_ENV!=="production"?["http://localhost:3000","http://localhost:3001","http://localhost:3007","http://127.0.0.1:3000","http://127.0.0.1:3001"]:[])]);
}
export function validateConfiguration(env=process.env) {
  const production=env.NODE_ENV==="production", uri=env.MONGODB_URI||env.MONOGDB_URL;
  if(!uri||!/^mongodb(?:\+srv)?:\/\//.test(uri))throw Error("MONGODB_URI required (MONOGDB_URL is supported legacy alias)");
  if(env.TWILLER_DEPLOYMENT_STAGE==="staging") {
    if(!production)throw Error("Staging requires NODE_ENV=production");
    if(env.TWILLER_LOCAL_AUTH_EMULATOR==="true"||env.FIREBASE_AUTH_EMULATOR_HOST)throw Error("Staging cannot use Firebase Auth Emulator");
    if(env.MONOGDB_URL)throw Error("Staging requires MONGODB_URI, not the legacy alias");
    const parsed=new URL(uri), database=parsed.pathname.replace(/^\//,"");
    if(!uri.startsWith("mongodb+srv://")||!parsed.hostname.endsWith(".mongodb.net")||database!=="twiller_staging")throw Error("Staging requires a separate Atlas twiller_staging database");
    if(!env.FIREBASE_PROJECT_ID||env.FIREBASE_PROJECT_ID.startsWith("demo-")||
      (env.FIREBASE_PROJECT_ID==="twill-12669"&&env.TWILLER_STAGING_ALLOW_EXISTING_FIREBASE!=="true"))throw Error("Staging requires a real Firebase project; existing project use requires explicit approval");
    if(!env.FIREBASE_SERVICE_ACCOUNT)throw Error("Staging Firebase Admin service account is required");
    let account;
    try { account=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch { throw Error("Staging Firebase service account JSON is invalid"); }
    if(account.project_id!==env.FIREBASE_PROJECT_ID||
      typeof account.client_email!=="string"||!account.client_email.endsWith(`@${env.FIREBASE_PROJECT_ID}.iam.gserviceaccount.com`)||
      typeof account.private_key!=="string"||!account.private_key)throw Error("Staging Firebase service account project mismatch");
    if(env.FRONTEND_ORIGINS?.includes("twiller-ruby.vercel.app")||
      env.MEDIA_PUBLIC_BASE_URL?.includes("localhost")||env.MEDIA_PUBLIC_BASE_URL?.includes("127.0.0.1"))throw Error("Staging requires separate public origins");
  }
  const isAtlasUri=!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri);
  if(!production&&isAtlasUri) {
    if(env.DEV_ATLAS!=="true")
      throw Error("Remote/Atlas MongoDB in development requires DEV_ATLAS=true in .env (use a staging database, not production data)");
    console.warn("⚠️  [dev] DEV_ATLAS=true — connected to remote Atlas. Keep this out of production config.");
  }
  corsOrigins(env);
  if(production) {
    if(!env.FRONTEND_ORIGINS||!env.MEDIA_PUBLIC_BASE_URL||!env.MEDIA_DIR)throw Error("Production origins/media configuration required");
    const media=new URL(env.MEDIA_PUBLIC_BASE_URL);
    const isLocalhost=["localhost","127.0.0.1"].includes(media.hostname);
    if(!isLocalhost&&(media.protocol!=="https:"||media.hostname===""))throw Error("Production media requires a public HTTPS URL");
  }
  if(!!env.RAZORPAY_KEY_ID!==!!env.RAZORPAY_KEY_SECRET)throw Error("Configure both Razorpay variables or disable payments");
  if(!!env.EMAIL_USER!==!!env.EMAIL_PASS)throw Error("Configure both SMTP variables");
  if(env.APPS_SCRIPT_URL) {
    let url;
    try { url=new URL(env.APPS_SCRIPT_URL); } catch { throw Error("Apps Script must use a valid HTTPS URL"); }
    if(url.protocol!=="https:")throw Error("Apps Script must use HTTPS");
    if(url.username||url.password||url.search||url.hash)throw Error("Apps Script URL must not contain credentials or query data");
    if(url.hostname!=="script.google.com"||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname))throw Error("Apps Script requires a deployed Google /exec URL");
    if(typeof env.APPS_SCRIPT_SECRET!=="string"||env.APPS_SCRIPT_SECRET.length<32||env.APPS_SCRIPT_SECRET.length>256||/\s/.test(env.APPS_SCRIPT_SECRET))
      throw Error("Apps Script requires a strong server-only secret");
  }
  if(env.NODE_ENV!=="test"&&!env.APPS_SCRIPT_URL&&!(env.EMAIL_USER&&env.EMAIL_PASS))throw Error("A confirmed mail transport is required for authentication");
  const dbType=isAtlasUri?"Atlas (remote)":"local";
  return {uri, production, dbType};
}
export function rejectOrigin(req,res,next) {
  if(req.headers.origin&&!corsOrigins().has(req.headers.origin))return next(Object.assign(new Error("Origin denied"),{status:403,code:"ORIGIN_DENIED"}));
  next();
}
