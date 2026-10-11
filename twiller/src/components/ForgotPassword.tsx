"use client";
import React, { useState } from "react";
import { ArrowLeft, Mail, Phone, KeyRound, Check, AlertTriangle, Shield, RefreshCw } from "lucide-react";
import axios from "axios";
import axiosInstance from "@/lib/axiosInstance";

export default function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setErrorMsg(""); setSuccess(false); setLoading(true);
    try {
      await axiosInstance.post("/forgot-password", { email: email.trim() });
      setSuccess(true);
    } catch (error) {
      setErrorMsg(axios.isAxiosError(error) ? error.response?.data?.error || "Could not send the reset link. Please retry." : "Could not send the reset link. Please retry.");
    } finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"><ArrowLeft className="h-5 w-5" /><span>Back to login</span></button>
        <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-500 px-6 py-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-4"><Shield className="h-8 w-8 text-white" /></div>
            <h1 className="text-2xl font-bold text-white">Forgot Password?</h1>
            <p className="text-blue-100 text-sm mt-2">We&apos;ll email you a link to choose a new password.</p>
          </div>
          <div className="p-6">
            {success ? <div className="space-y-5">
              <div role="status" className="flex items-start gap-3 p-4 rounded-2xl bg-green-950/60 border border-green-700 text-green-300 text-sm"><Check className="h-5 w-5 flex-shrink-0" /><span>If your account supports password sign-in, a reset link has been sent. Check your inbox and spam folder.</span></div>
              <p className="text-sm text-gray-400">Your password stays the same until you use the link. If you signed in with Google, you can continue using Google sign-in.</p>
              <button type="button" onClick={onBack} className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-full">Go to Login</button>
            </div> : <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex gap-2 bg-gray-900 rounded-full p-1" role="group" aria-label="Recovery method">
                {(["email", "phone"] as const).map(option => <button key={option} type="button" aria-pressed={mode === option} onClick={() => { setMode(option); setEmail(""); setErrorMsg(""); }} className={`min-h-11 flex-1 rounded-full py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${mode === option ? "bg-blue-500 text-white" : "text-gray-400"}`}>{option === "email" ? "Email" : "Phone"}</button>)}
              </div>
              <div><label htmlFor="recovery-email" className="text-sm text-gray-400 mb-1 block">{mode === "email" ? "Email address" : "Registered phone number"}</label>
                <div className="relative">{mode === "email" ? <Mail aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" /> : <Phone aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />}<input id="recovery-email" type={mode === "email" ? "email" : "tel"} autoComplete={mode === "email" ? "email" : "tel"} required maxLength={mode === "email" ? 254 : 25} aria-invalid={Boolean(errorMsg)} aria-describedby={errorMsg ? "recovery-error" : undefined} placeholder={mode === "email" ? "Enter your email" : "Enter your registered phone number"} value={email} onChange={event => setEmail(event.target.value)} className="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500" /></div>
              </div>
              {errorMsg && <div id="recovery-error" role="alert" className="flex items-start gap-3 p-4 rounded-2xl bg-red-950/60 border border-red-800 text-red-300 text-sm"><AlertTriangle aria-hidden="true" className="h-5 w-5 flex-shrink-0" /><span>{errorMsg}</span></div>}
              <p className="text-gray-500 text-xs">The reset link goes to your registered email, expires and can only be used once. Requesting it does not change your password.</p>
              <button type="submit" aria-busy={loading} disabled={loading || !email.trim()} className="min-h-11 w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-full flex items-center justify-center gap-2">{loading ? <span role="status"><RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />Sending...</span> : <><KeyRound aria-hidden="true" className="h-4 w-4" />Send reset link</>}</button>
            </form>}
          </div>
        </div>
      </div>
    </div>
  );
}
