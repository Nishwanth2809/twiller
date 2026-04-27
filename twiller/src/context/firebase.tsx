// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB-HLSQR08Ia813o0XHtlyPN7YF2x0n8Fo",
  authDomain: "twill-12669.firebaseapp.com",
  projectId: "twill-12669",
  storageBucket: "twill-12669.firebasestorage.app",
  messagingSenderId: "804498612401",
  appId: "1:804498612401:web:8a63d6f079d43414a1c290",
  measurementId: "G-HZNR2GYBYB",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
