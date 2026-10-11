// Import the functions you need from the SDKs you need
import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { firebaseWebConfig } from "@/lib/firebase-config";

const emulatorOptIn = process.env.NEXT_PUBLIC_TWILLER_LOCAL_AUTH_EMULATOR === "true";
if (process.env.NODE_ENV === "production" && emulatorOptIn) {
  throw new Error("Firebase Auth Emulator cannot be enabled in a production build");
}
const useAuthEmulator = process.env.NODE_ENV !== "production" && emulatorOptIn;
const emulatorProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const emulatorUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;
if (useAuthEmulator) {
  if (!emulatorProjectId || !/^demo-[a-z0-9-]{1,29}$/.test(emulatorProjectId)) {
    throw new Error("Local Firebase Auth Emulator requires a demo-* Firebase project ID");
  }
  let parsedEmulatorUrl: URL;
  try { parsedEmulatorUrl = new URL(emulatorUrl || ""); }
  catch { throw new Error("A valid local Firebase Auth Emulator URL is required"); }
  if (parsedEmulatorUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(parsedEmulatorUrl.hostname) || !parsedEmulatorUrl.port || parsedEmulatorUrl.pathname !== "/") {
    throw new Error("Firebase Auth Emulator URL must use an explicit loopback HTTP endpoint");
  }
}

// Your web app's Firebase configuration
const firebaseConfig = {
  ...firebaseWebConfig(process.env.NEXT_PUBLIC_TWILLER_DEPLOYMENT_STAGE, {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }, {
    apiKey: "AIzaSyB-HLSQR08Ia813o0XHtlyPN7YF2x0n8Fo",
    authDomain: "twill-12669.firebaseapp.com",
    projectId: "twill-12669",
    storageBucket: "twill-12669.firebasestorage.app",
    messagingSenderId: "804498612401",
    appId: "1:804498612401:web:8a63d6f079d43414a1c290",
    measurementId: "G-HZNR2GYBYB",
  }, process.env.NEXT_PUBLIC_VERCEL_ENV, process.env.NEXT_PUBLIC_TWILLER_STAGING_ALLOW_EXISTING_FIREBASE === "true"),
  ...(useAuthEmulator ? { projectId: emulatorProjectId } : {}),
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
if (useAuthEmulator && typeof window !== "undefined") {
  // Firebase HMR reuses this Auth instance; preserve the marker to avoid a second connection.
  const localAuth = auth as typeof auth & { __twillerLocalAuthEmulatorConnected?: boolean };
  if (!localAuth.__twillerLocalAuthEmulatorConnected) {
    connectAuthEmulator(auth, emulatorUrl!, { disableWarnings: true });
    localAuth.__twillerLocalAuthEmulatorConnected = true;
  }
}
export default app;
