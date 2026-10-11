import axios from "axios";
import { auth } from "../context/firebase";
import { apiBaseUrl } from "./api-config";
import { demoAdapter, localDemoEnabled } from "./local-demo";

const axiosInstance = axios.create({
  baseURL: apiBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL, process.env.NODE_ENV === "production"),
  ...(localDemoEnabled ? { adapter: demoAdapter } : {}),
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use(async config => {
  if (localDemoEnabled) return config;
  const user = auth.currentUser;
  if (user) config.headers.Authorization = `Bearer ${await user.getIdToken()}`;
  return config;
});

axiosInstance.interceptors.response.use(response => response, async error => {
  const code = error.response?.data?.code;
  const url = error.config?.url || "";
  // On INVALID_TOKEN, force-refresh the Firebase token and retry once before giving up.
  // This handles the common case where a cached token has just expired.
  if (code === "INVALID_TOKEN" && !error.config?._retried && auth.currentUser) {
    error.config._retried = true;
    try {
      const freshToken = await auth.currentUser.getIdToken(true); // force refresh
      error.config.headers.Authorization = `Bearer ${freshToken}`;
      return axiosInstance(error.config);
    } catch {
      // Force-refresh failed — token is truly invalid, fall through to session-expired
    }
  }
  // Only fire session-expired if there's actually a Firebase user signed in.
  // If auth.currentUser is null, the 401 is just an unauthenticated request — not an expired session.
  // Also skip the initial auth endpoints — they have their own error handling in AuthContext.
  const isAuthEndpoint = url.includes("/log-session") || url.includes("/register") || url.includes("/loggedinuser");
  if (!isAuthEndpoint && auth.currentUser && ["AUTH_REQUIRED", "INVALID_TOKEN", "SESSION_REVOKED"].includes(code) && typeof window !== "undefined") {
    window.dispatchEvent(new Event("twiller-session-expired"));
  }
  return Promise.reject(error);
});

export default axiosInstance;
