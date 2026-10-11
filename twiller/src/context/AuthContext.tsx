"use client";
import { browserPopupRedirectResolver, createUserWithEmailAndPassword, GoogleAuthProvider, getRedirectResult, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signInWithRedirect, signOut } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { auth } from "./firebase";
import axiosInstance from "../lib/axiosInstance";
import { AuthGeneration, completeSession } from "../lib/auth-session";
import { demoSessionActive, demoUser, localDemoEnabled, setDemoSession, updateDemoUser } from "../lib/local-demo";

interface User {
  _id: string;
  username: string;
  displayName: string;
  avatar: string;
  bio?: string;
  joinedDate: string;
  email: string;
  website: string;
  location: string;
  plan: "free" | "bronze" | "silver" | "gold";
  tweetCount: number;
  planExpiresAt: string | null;
  planLimit?: number;
  remaining?: number;
  quotaStartsAt?: string | null;
  quotaResetsAt?: string | null;
  loginHistory?: Array<{
    browser: string;
    os: string;
    device: string;
    ip: string;
    timestamp: string;
    status: string;
  }>;
  notificationsEnabled?: boolean;
  // Social graph
  followers: string[];
  following: string[];
  bookmarks: string[];
}


type ProfileInput = Pick<User, "displayName" | "avatar" | "bio" | "location" | "website" | "notificationsEnabled">;
type AuthStatus = "initializing" | "anonymous" | "pending" | "authenticated" | "registration-required" | "denied";
interface AuthContextType {
  user: User | null;
  status: AuthStatus;
  authError: string;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, username: string, displayName: string) => Promise<boolean>;
  googlesignin: () => Promise<boolean>;
  startDemoSession: () => Promise<boolean>;
  isDemoMode: boolean;
  updateProfile: (data: ProfileInput) => Promise<User>;
  logout: () => Promise<void>;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  otpPendingEmail: string | null;
  verifyOtp: (otp: string) => Promise<void>;
  cancelOtp: () => Promise<void>;
  retrySession: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
const message = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.error || "Unable to complete sign-in. Please retry" : error instanceof Error ? error.message : "Unable to complete sign-in";
const redirectErrorMessage = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "auth/network-request-failed" || code === "redirect-timeout") return "Google sign-in could not reach Firebase. Check the local emulator and try again.";
  if (code === "auth/operation-not-allowed") return "Google sign-in is not enabled for this Firebase project.";
  if (code === "auth/cancelled-popup-request" || code === "auth/user-cancelled") return "Google sign-in was canceled. Please try again.";
  return "Google sign-in could not be completed. Please try again.";
};
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [otpPendingEmail, setOtpPendingEmail] = useState<string | null>(null);
  const isDemoMode = localDemoEnabled;
  const generation = useRef(new AuthGeneration());
  const operating = useRef<number | null>(null);
  const activeGeneration = useRef(0);
  const redirectResult = useRef<ReturnType<typeof getRedirectResult> | null>(null);
  const clear = () => { setUser(null); setOtpPendingEmail(null); };
  const begin = () => {
    const next = generation.current.next();
    activeGeneration.current = next;
    clear(); setAuthError(""); setIsLoading(true);
    return next;
  };
  const current = (g: number, firebaseUser: FirebaseUser) => generation.current.current(g) && auth.currentUser?.uid === firebaseUser.uid;
  const load = async (firebaseUser: FirebaseUser, g: number) => {
    // Use the token directly from the known firebaseUser — avoids auth.currentUser race window.
    const token = await firebaseUser.getIdToken();
    const authHeader = { Authorization: `Bearer ${token}` };

    // Inner helper: attempt session + profile fetch.
    const attempt = () => completeSession(
      async () => (await axiosInstance.post("/log-session", {}, { headers: authHeader })).data,
      async () => (await axiosInstance.get<User>("/loggedinuser", { headers: authHeader })).data,
    );

    let result;
    try {
      result = await attempt();
    } catch (error) {
      // If the backend says no profile yet AND this is a Google OAuth user,
      // auto-register now (race: onAuthStateChanged fired before getRedirectResult's /register call)
      // then retry the session flow once.
      const code = axios.isAxiosError(error) ? error.response?.data?.code : undefined;
      const isGoogle = firebaseUser.providerData.some(p => p.providerId === "google.com");
      if (code === "PROFILE_REQUIRED" && isGoogle && firebaseUser.email) {
        const prefix = firebaseUser.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 50).padEnd(3, "_");
        await axiosInstance.post("/register",
          { username: prefix, displayName: (firebaseUser.displayName || "User").slice(0, 50), avatar: firebaseUser.photoURL || "" },
          { headers: authHeader }
        );
        result = await attempt(); // retry after registration
      } else {
        throw error;
      }
    }

    if (!current(g, firebaseUser)) return false;
    if (result.status === "pending") {
      setUser(null); setStatus("pending"); setOtpPendingEmail(firebaseUser.email);
      return false;
    }
    setUser(result.user); setStatus("authenticated"); setOtpPendingEmail(null);
    return true;
  };
  const handleError = async (error: unknown, firebaseUser: FirebaseUser | null, g: number) => {
    if (!generation.current.current(g)) return;
    clear();
    const code = axios.isAxiosError(error) ? error.response?.data?.code : undefined;
    if (code === "PROFILE_REQUIRED") setStatus("registration-required");
    else if (code === "VERIFY_EMAIL_REQUIRED" && firebaseUser) {
      try { await sendEmailVerification(firebaseUser); }
      catch { if (generation.current.current(g)) { setStatus("denied"); setAuthError("We could not send email verification. Please retry sign-in."); } return; }
      if (generation.current.current(g)) { setStatus("denied"); setAuthError("Check your email to verify your existing account, then sign in again."); }
      return;
    } else setStatus("denied");
    setAuthError(message(error));
  };
  const restore = async (firebaseUser: FirebaseUser | null) => {
    const g = begin();
    if (!firebaseUser) { setStatus("anonymous"); setIsLoading(false); return; }
    try { await load(firebaseUser, g); }
    catch (error) { await handleError(error, firebaseUser, g); }
    finally { if (generation.current.current(g)) setIsLoading(false); }
  };
  useEffect(() => {
    if (localDemoEnabled) {
      if (demoSessionActive()) { setUser(demoUser()); setStatus("authenticated"); }
      else setStatus("anonymous");
      setIsLoading(false);
      return;
    }
    // Old private snapshots were never read. Remove them rather than trust/cache them.
    try { localStorage.removeItem("twitter-user"); } catch { /* storage may be disabled */ }
    const tracker = generation.current;
    let alive = true;
    let redirectSettled = false;
    let initialAuthStateReceived = false;
    let initialSettled = false;
    let observedUser: FirebaseUser | null = null;
    let redirectUser: FirebaseUser | null = null;
    let redirectError: unknown = null;
    let lastHandledUid: string | null | undefined;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    const settleInitialAuth = () => {
      if (!alive || !redirectSettled || !initialAuthStateReceived || initialSettled) return;
      initialSettled = true;
      const firebaseUser = auth.currentUser || redirectUser || observedUser;
      lastHandledUid = firebaseUser?.uid ?? null;
      // A user-initiated login/signup may begin before Firebase finishes its first
      // observer callback. Its own authenticate() call owns session initialization.
      if (operating.current !== null) return;
      if (!firebaseUser && redirectError) {
        generation.current.next();
        clear();
        setStatus("denied");
        setAuthError(redirectErrorMessage(redirectError));
        setIsLoading(false);
        return;
      }
      void restore(firebaseUser).finally(() => {
        if (alive && redirectError) setAuthError(redirectErrorMessage(redirectError));
      });
    };
    const handleAuthState = (firebaseUser: FirebaseUser | null) => {
      observedUser = firebaseUser;
      initialAuthStateReceived = true;
      if (!redirectSettled) return;
      if (!initialSettled) {
        settleInitialAuth();
        return;
      }
      const uid = firebaseUser?.uid ?? null;
      if (operating.current !== null || uid === lastHandledUid) return;
      lastHandledUid = uid;
      void restore(firebaseUser);
    };
    const unsubscribe = onAuthStateChanged(auth, handleAuthState);
    // Resolve Firebase's one-time redirect result before the initial auth observer
    // starts application session/profile work. This prevents duplicate registration
    // or session creation when both APIs report the same redirected user.
    // Keep the promise across Strict Mode's development effect replay so Firebase's
    // one-time redirect result is consumed only once for this provider instance.
    redirectResult.current ??= getRedirectResult(auth, browserPopupRedirectResolver);
    void redirectResult.current.then(result => {
      redirectUser = result?.user ?? null;
      redirectError = null;
      if (redirectUser) {
        observedUser = redirectUser;
        initialAuthStateReceived = true;
      }
      if (redirectTimer) clearTimeout(redirectTimer);
      redirectTimer = undefined;
      redirectSettled = true;
      settleInitialAuth();
      // If the watchdog already settled initialization, still honor a late result.
      if (alive && initialSettled && redirectUser && redirectUser.uid !== lastHandledUid && operating.current === null) {
        lastHandledUid = redirectUser.uid;
        void restore(redirectUser);
      }
    }).catch(error => {
      redirectError = error;
      observedUser = auth.currentUser;
      initialAuthStateReceived = true;
      if (redirectTimer) clearTimeout(redirectTimer);
      redirectTimer = undefined;
      redirectSettled = true;
      settleInitialAuth();
    });
    // A stalled redirect lookup must not hold the app on its startup spinner forever.
    redirectTimer = setTimeout(() => {
      redirectError = Object.assign(new Error("Google redirect result timed out"), { code: "redirect-timeout" });
      redirectTimer = undefined;
      observedUser = auth.currentUser;
      initialAuthStateReceived = true;
      redirectSettled = true;
      settleInitialAuth();
    }, 10000);
    let expiredFiring = false;
    const expired = async () => {
      if (expiredFiring) return; // debounce — prevent feedback loop
      expiredFiring = true;
      generation.current.next();
      clear();
      setStatus("denied");
      setIsLoading(false);
      setAuthError("Your session has expired. Please sign in again.");
      try { await auth.signOut(); } catch { /* ignore */ }
      expiredFiring = false;
    };
    window.addEventListener("twiller-session-expired", expired);
    return () => { alive = false; if (redirectTimer) clearTimeout(redirectTimer); unsubscribe(); tracker.next(); window.removeEventListener("twiller-session-expired", expired); };
    // The listener deliberately uses generation guards instead of state dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const authenticate = async (obtain: () => Promise<FirebaseUser>, register?: (firebaseUser: FirebaseUser) => Promise<void>) => {
    if (operating.current !== null) return false;
    const g = begin();
    operating.current = g;
    let firebaseUser: FirebaseUser | null = null;
    try {
      firebaseUser = await obtain();
      if (!current(g, firebaseUser)) return false;
      if (register) await register(firebaseUser);
      if (!current(g, firebaseUser)) return false;
      return await load(firebaseUser, g);
    } catch (error) {
      await handleError(error, firebaseUser, g);
      throw new Error(message(error));
    } finally {
      if (generation.current.current(g)) setIsLoading(false);
      if (operating.current === g) operating.current = null;
    }
  };
  const login = (email: string, password: string) => localDemoEnabled
    ? Promise.reject(new Error("Use Enter local demo; password sign-in is not connected in demo mode."))
    : authenticate(async () => (await signInWithEmailAndPassword(auth, email, password)).user);
  const signup = (email: string, password: string, username: string, displayName: string) => localDemoEnabled
    ? Promise.reject(new Error("Use Enter local demo; account creation is not connected in demo mode."))
    : authenticate(async () => {
    // Retry profile creation for a Firebase account left behind by a failed save.
    if (auth.currentUser?.email?.toLowerCase() === email.toLowerCase()) return auth.currentUser;
    try { return (await createUserWithEmailAndPassword(auth, email, password)).user; }
    catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "auth/email-already-in-use") return (await signInWithEmailAndPassword(auth, email, password)).user;
      throw error;
    }
  }, async firebaseUser => { await axiosInstance.post("/register", { username, displayName, avatar: firebaseUser.photoURL || "" }); });
  // signInWithRedirect avoids COOP issues: accounts.google.com sets COOP:same-origin which
  // nullifies window.opener in the popup, breaking signInWithPopup's result delivery.
  // The redirect result is processed in the useEffect via getRedirectResult.
  const googlesignin = async () => {
    if (localDemoEnabled) throw new Error("Google sign-in is unavailable in local demo mode.");
    if (operating.current !== null) return false;
    try { await signInWithRedirect(auth, new GoogleAuthProvider(), browserPopupRedirectResolver); }
    catch (error) { setAuthError(message(error)); }
    return false;
  };
  const startDemoSession = async () => {
    if (!localDemoEnabled) throw new Error("Local demo mode is not enabled.");
    setDemoSession(true);
    setUser(demoUser());
    setOtpPendingEmail(null);
    setAuthError("");
    setStatus("authenticated");
    setIsLoading(false);
    return true;
  };
  const logout = async () => {
    if (localDemoEnabled) {
      generation.current.next();
      setDemoSession(false);
      clear(); setStatus("anonymous"); setIsLoading(false); setAuthError("");
      return;
    }
    const g = generation.current.next(); activeGeneration.current = g;
    clear(); setStatus("anonymous"); setIsLoading(false); setAuthError("");
    operating.current = g;
    try { if (typeof localStorage !== "undefined") localStorage.removeItem("twitter-user"); } catch { /* storage may be disabled */ }
    try { if (auth.currentUser) await axiosInstance.post("/logout", {}); }
    finally { try { await signOut(auth); } finally { if (operating.current === g) operating.current = null; } }
  };
  const verifyOtp = async (otp: string) => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !otpPendingEmail) throw new Error("Please sign in again");
    const g = activeGeneration.current;
    setIsLoading(true); setAuthError("");
    try {
      await axiosInstance.post("/verify-login-otp", { otp });
      const data = await axiosInstance.get<User>("/loggedinuser");
      if (current(g, firebaseUser)) { setUser(data.data); setOtpPendingEmail(null); setStatus("authenticated"); }
    } catch (error) { if (current(g, firebaseUser)) setAuthError(message(error)); throw new Error(message(error)); }
    finally { if (generation.current.current(g)) setIsLoading(false); }
  };
  const refreshUser = async () => {
    if (localDemoEnabled) { setUser(demoUser()); return; }
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || status !== "authenticated") return;
    const g = activeGeneration.current;
    await generation.current.publish(g, async () => (await axiosInstance.get<User>("/loggedinuser")).data, setUser);
  };
  const updateProfile = async (data: ProfileInput) => {
    if (!user) throw new Error("Please sign in again");
    const g = activeGeneration.current;
    const fields = { displayName: data.displayName, avatar: data.avatar, bio: data.bio, location: data.location, website: data.website, notificationsEnabled: data.notificationsEnabled };
    if (localDemoEnabled) {
      const updated = updateDemoUser(fields) as User;
      setUser(updated);
      return updated;
    }
    // Send only editable fields; adopt the safe canonical response.
    const updated = await generation.current.publish(g, async () => (await axiosInstance.patch<User>(`/userupdate/${encodeURIComponent(user.email)}`, fields)).data, setUser);
    if (!generation.current.current(g)) throw new Error("Account changed. Please reopen profile settings.");
    return updated;
  };
  const retrySession = async () => {
    if (localDemoEnabled) {
      if (demoSessionActive()) { setUser(demoUser()); setStatus("authenticated"); }
      else { setUser(null); setStatus("anonymous"); }
      setIsLoading(false);
      return;
    }
    await restore(auth.currentUser);
  };
  return <AuthContext.Provider value={{ user, status, authError, login, signup, googlesignin, startDemoSession, isDemoMode, updateProfile, logout, isLoading, refreshUser, otpPendingEmail, verifyOtp, cancelOtp: logout, retrySession }}>{children}</AuthContext.Provider>;
};
