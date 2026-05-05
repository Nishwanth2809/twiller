"use client";

import React, { useState } from "react";
import { ArrowLeft, Mail, Phone, KeyRound, Check, AlertTriangle, Shield, RefreshCw } from "lucide-react";
import axios from "axios";
import axiosInstance from "@/lib/axiosInstance";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/context/firebase";

export default function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [rateLimited, setRateLimited] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [emailDeliveryFailed, setEmailDeliveryFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setRateLimited(false);
    setSuccess(false);
    setGeneratedPassword("");
    setEmailDeliveryFailed(false);

    if (!emailOrPhone.trim()) {
      setErrorMsg("Please enter your email address or phone number.");
      return;
    }

    setLoading(true);
    try {
      // Call backend to generate password + send email
      const res = await axiosInstance.post("/forgot-password", {
        email: emailOrPhone.trim(),
      });

      if (res.data.success) {
        setSuccess(true);
        setGeneratedPassword(res.data.generatedPassword || "");
        setEmailDeliveryFailed(Boolean(res.data.emailDeliveryFailed));

        // Also trigger Firebase password reset link
        if (mode === "email") {
          try {
            await sendPasswordResetEmail(auth, emailOrPhone.trim());
          } catch {
            // Firebase reset email is optional backup — ignore errors
          }
        }
      }
    } catch (error: unknown) {
      const data = axios.isAxiosError(error)
        ? error.response?.data as { rateLimited?: boolean; error?: string } | undefined
        : undefined;

      if (data?.rateLimited) {
        setRateLimited(true);
        setErrorMsg(data.error || "You can use this option only one time per day.");
      } else {
        setErrorMsg(data?.error || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to login</span>
        </button>

        {/* Main card */}
        <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-4">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Forgot Password?</h1>
            <p className="text-blue-100 text-sm mt-2">
              We&apos;ll generate a new password and send it to your email
            </p>
          </div>

          {/* Body */}
          <div className="p-6">
            {/* Success State */}
            {success ? (
              <div className="space-y-5">
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-green-950/60 border border-green-700 text-green-300 text-sm">
                  <Check className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <span>
                    {emailDeliveryFailed
                      ? "New password generated. Email delivery failed, so use the password below."
                      : <>New password generated and sent to <strong>{emailOrPhone}</strong></>}
                  </span>
                </div>

                {generatedPassword && (
                  <div className="rounded-2xl border border-blue-800 bg-blue-950/40 p-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-blue-300/70 mb-2">New Password</p>
                    <p className="font-mono text-2xl font-bold text-blue-200 break-all">{generatedPassword}</p>
                  </div>
                )}

                {/* Instructions */}
                <div className="bg-yellow-950/40 border border-yellow-800 rounded-2xl p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-300">
                      <p className="font-semibold mb-1">Important</p>
                      <ul className="space-y-1 text-yellow-400/80">
                        <li>• Use this password to log in</li>
                        <li>
                          • {emailDeliveryFailed
                            ? "Save this password now because the email could not be sent"
                            : "A copy has been sent to your email"}
                        </li>
                        <li>• You can only reset once per day</li>
                        <li>• Check your spam folder if not received</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <button
                  onClick={onBack}
                  className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-full transition-colors"
                >
                  Go to Login
                </button>
              </div>
            ) : (
              /* Form State */
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Mode Toggle */}
                <div className="flex gap-2 bg-gray-900 rounded-full p-1">
                  <button
                    type="button"
                    onClick={() => { setMode("email"); setEmailOrPhone(""); setErrorMsg(""); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium transition-all ${
                      mode === "email"
                        ? "bg-blue-500 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Mail className="h-4 w-4" />
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode("phone"); setEmailOrPhone(""); setErrorMsg(""); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium transition-all ${
                      mode === "phone"
                        ? "bg-blue-500 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Phone className="h-4 w-4" />
                    Phone
                  </button>
                </div>

                {/* Input */}
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    {mode === "email" ? "Email Address" : "Phone Number"}
                  </label>
                  <div className="relative">
                    {mode === "email" ? (
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                    ) : (
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                    )}
                    <input
                      type={mode === "email" ? "email" : "tel"}
                      placeholder={mode === "email" ? "Enter your email" : "Enter your phone number"}
                      value={emailOrPhone}
                      onChange={(e) => setEmailOrPhone(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Rate Limit Warning */}
                {rateLimited && (
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-orange-950/60 border border-orange-700 text-orange-300 text-sm">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* General Error */}
                {errorMsg && !rateLimited && (
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-950/60 border border-red-800 text-red-300 text-sm">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Info */}
                <div className="flex items-start gap-2 text-gray-500 text-xs">
                  <KeyRound className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    A new password will be generated using only letters (A-Z, a-z) with no numbers
                    or special characters. It will be emailed to you.
                  </span>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || !emailOrPhone.trim()}
                  className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-full transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      Reset Password
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs mt-6">
          You can only reset your password once per day.
        </p>
      </div>
    </div>
  );
}
