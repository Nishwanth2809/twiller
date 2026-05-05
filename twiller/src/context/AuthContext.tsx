"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import React, { createContext, useContext, useState, useEffect } from "react";
import { auth } from "./firebase";
import axiosInstance from "../lib/axiosInstance";

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
  loginHistory?: Array<{
    browser: string;
    os: string;
    device: string;
    ip: string;
    timestamp: string;
    status: string;
  }>;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    username: string,
    displayName: string
  ) => Promise<void>;
  updateProfile: (profileData: {
    displayName: string;
    bio: string;
    location: string;
    website: string;
    avatar: string;
  }) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  googlesignin: () => void;
  refreshUser: () => Promise<void>;
  otpPendingEmail: string | null;
  verifyOtp: (otp: string) => Promise<void>;
  cancelOtp: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [otpPendingEmail, setOtpPendingEmail] = useState<string | null>(null);

  const handleSessionAccess = async (email: string) => {
    try {
      const res = await axiosInstance.post("/log-session", { email });
      if (res.data.requiresOtp) {
        setOtpPendingEmail(email);
        return false;
      }
      return true;
    } catch (error: any) {
      if (error.response?.status === 403) {
        alert(error.response.data.error);
        await signOut(auth);
      }
      throw error;
    }
  };

  const cancelOtp = async () => {
    setOtpPendingEmail(null);
    await signOut(auth);
  };

  const verifyOtp = async (otp: string) => {
    if (!otpPendingEmail) return;
    setIsLoading(true);
    try {
      await axiosInstance.post("/verify-login-otp", { email: otpPendingEmail, otp });
      await fetchAndSetUser(otpPendingEmail);
      setOtpPendingEmail(null);
    } catch (err: any) {
      alert(err.response?.data?.error || "Invalid OTP");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAndSetUser = async (email: string) => {
    const res = await axiosInstance.get("/loggedinuser", {
      params: { email },
    });
    if (res.data) {
      setUser(res.data);
      localStorage.setItem("twitter-user", JSON.stringify(res.data));
    }
    return res.data;
  };

  const refreshUser = async () => {
    if (!user?.email) return;
    try {
      await fetchAndSetUser(user.email);
    } catch (err) {
      console.error("Failed to refresh user:", err);
    }
  };

  useEffect(() => {
    const unsubcribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser?.email) {
        try {
          await fetchAndSetUser(firebaseUser.email);
        } catch (err) {
          console.log("Failed to fetch user:", err);
          // User exists in Firebase but not in MongoDB — clear stale state
          setUser(null);
          localStorage.removeItem("twitter-user");
        }
      } else {
        setUser(null);
        localStorage.removeItem("twitter-user");
      }
      setIsLoading(false);
    });
    return () => unsubcribe();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const usercred = await signInWithEmailAndPassword(auth, email, password);
      const allowed = await handleSessionAccess(usercred.user.email!);
      if (allowed) {
        await fetchAndSetUser(usercred.user.email!);
      }
    } catch (error: any) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    email: string,
    password: string,
    username: string,
    displayName: string
  ) => {
    setIsLoading(true);
    try {
      const usercred = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = usercred.user;
      const newuser: any = {
        username,
        displayName,
        avatar:
          firebaseUser.photoURL ||
          "https://images.pexels.com/photos/1139743/pexels-photo-1139743.jpeg?auto=compress&cs=tinysrgb&w=400",
        email: firebaseUser.email,
      };
      const res = await axiosInstance.post("/register", newuser);
      
      const allowed = await handleSessionAccess(firebaseUser.email!);
      if (allowed && res.data) {
        setUser(res.data);
        localStorage.setItem("twitter-user", JSON.stringify(res.data));
      }
    } catch (error: any) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setUser(null);
    await signOut(auth);
    localStorage.removeItem("twitter-user");
  };

  const updateProfile = async (profileData: {
    displayName: string;
    bio: string;
    location: string;
    website: string;
    avatar: string;
  }) => {
    if (!user) return;
    setIsLoading(true);
    const updatedUser: User = { ...user, ...profileData };
    const res = await axiosInstance.patch(`/userupdate/${user.email}`, updatedUser);
    if (res.data) {
      setUser(updatedUser);
      localStorage.setItem("twitter-user", JSON.stringify(updatedUser));
    }
    setIsLoading(false);
  };

  const googlesignin = async () => {
    setIsLoading(true);
    try {
      const googleauthprovider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, googleauthprovider);
      const firebaseUser = result.user;
      if (!firebaseUser?.email) throw new Error("No email found in Google account");

      let userData;

      // Try to find existing user
      try {
        const res = await axiosInstance.get("/loggedinuser", {
          params: { email: firebaseUser.email },
        });
        if (res.data && res.data._id) {
          userData = res.data;
        }
      } catch {
        // User not found (404) or other error — will register below
      }

      // Register if not found
      if (!userData) {
        const newuser: any = {
          username: firebaseUser.email.split("@")[0],
          displayName: firebaseUser.displayName || "User",
          avatar:
            firebaseUser.photoURL ||
            "https://images.pexels.com/photos/1139743/pexels-photo-1139743.jpeg?auto=compress&cs=tinysrgb&w=400",
          email: firebaseUser.email,
        };
        const registerRes = await axiosInstance.post("/register", newuser);
        userData = registerRes.data;
      }

      const allowed = await handleSessionAccess(firebaseUser.email);
      if (!allowed) {
        setIsLoading(false);
        return;
      }

      if (userData) {
        setUser(userData);
        localStorage.setItem("twitter-user", JSON.stringify(userData));
      } else {
        throw new Error("Login/Register failed: No user data returned");
      }
    } catch (error: any) {
      console.error("Google Sign-In Error:", error);
      alert(error.response?.data?.message || error.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        updateProfile,
        logout,
        isLoading,
        googlesignin,
        refreshUser,
        otpPendingEmail,
        verifyOtp,
        cancelOtp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
