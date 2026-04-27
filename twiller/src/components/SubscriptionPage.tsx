"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import axiosInstance from "@/lib/axiosInstance";
import { Crown, Zap, Star, Gift, Clock, CheckCircle, AlertTriangle } from "lucide-react";

// ─── Plan Config ──────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    priceLabel: "Free",
    icon: Gift,
    color: "from-gray-600 to-gray-700",
    border: "border-gray-700",
    badge: "bg-gray-700 text-gray-200",
    limit: "1 tweet / month",
    features: ["Basic access", "1 tweet per month", "Community support"],
    cta: "Current Free Plan",
    disabled: true,
  },
  {
    id: "bronze",
    name: "Bronze",
    price: 100,
    priceLabel: "₹100/mo",
    icon: Star,
    color: "from-amber-700 to-amber-600",
    border: "border-amber-700",
    badge: "bg-amber-700 text-amber-100",
    limit: "3 tweets / month",
    features: ["3 tweets per month", "Priority feed ranking", "Email support"],
    cta: "Subscribe to Bronze",
    disabled: false,
  },
  {
    id: "silver",
    name: "Silver",
    price: 300,
    priceLabel: "₹300/mo",
    icon: Zap,
    color: "from-slate-400 to-slate-500",
    border: "border-slate-400",
    badge: "bg-slate-500 text-white",
    limit: "5 tweets / month",
    features: ["5 tweets per month", "Verified badge", "Priority support"],
    cta: "Subscribe to Silver",
    disabled: false,
    popular: true,
  },
  {
    id: "gold",
    name: "Gold",
    price: 1000,
    priceLabel: "₹1000/mo",
    icon: Crown,
    color: "from-yellow-500 to-yellow-400",
    border: "border-yellow-500",
    badge: "bg-yellow-500 text-yellow-900",
    limit: "Unlimited tweets",
    features: ["Unlimited tweets", "Gold verified badge", "Dedicated support", "Analytics dashboard"],
    cta: "Subscribe to Gold",
    disabled: false,
  },
];

// ─── IST Time Check ───────────────────────────────────────────────────────────
function getISTInfo() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  const pad = (n: number) => String(n).padStart(2, "0");
  const timeStr = `${pad(hours)}:${pad(minutes)} IST`;
  return { isOpen: totalMinutes >= 600 && totalMinutes < 660, timeStr };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SubscriptionPage() {
  const { user, refreshUser } = useAuth();
  const [istInfo, setIstInfo] = useState(getISTInfo());
  const [userPlan, setUserPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setIstInfo(getISTInfo()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user?.email) fetchUserPlan();
  }, [user]);

  const fetchUserPlan = async () => {
    try {
      const res = await axiosInstance.get(`/user-plan/${user!.email}`);
      setUserPlan(res.data);
    } catch (err) {
      console.error("Failed to fetch plan:", err);
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!user) return;
    setErrorMsg("");
    setSuccessMsg("");

    if (!istInfo.isOpen) {
      setErrorMsg("Payments are only accepted between 10:00 AM and 11:00 AM IST.");
      return;
    }
    setLoading(true);

    try {
      // 1. Create Razorpay order
      const orderRes = await axiosInstance.post("/create-order", {
        plan: planId,
        email: user.email,
      });
      const { orderId, amount, currency } = orderRes.data;

      // 2. Open Razorpay checkout
      const options: any = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount,
        currency,
        name: "Twiller Premium",
        description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan Subscription`,
        order_id: orderId,
        prefill: {
          name: user.displayName,
          email: user.email,
        },
        theme: { color: "#1d9bf0" },
        handler: async (response: any) => {
          try {
            const verifyRes = await axiosInstance.post("/verify-payment", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan: planId,
              email: user.email,
            });

            if (verifyRes.data.success) {
              setSuccessMsg(
                `🎉 Successfully upgraded to ${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan! Invoice sent to ${user.email}`
              );
              await refreshUser();
              await fetchUserPlan();
            }
          } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Payment verification failed.");
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", (resp: any) => {
        setErrorMsg(`Payment failed: ${resp.error.description}`);
        setLoading(false);
      });
      rzp.open();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || "Failed to initiate payment.");
    } finally {
      setLoading(false);
    }
  };

  const currentPlan = userPlan?.plan || user?.plan || "free";
  const tweetCount = userPlan?.tweetCount ?? 0;
  const planLimit = userPlan?.planLimit === -1 ? Infinity : (userPlan?.planLimit ?? 1);

  return (
    <>
      {/* Razorpay SDK Script */}
      <script src="https://checkout.razorpay.com/v1/checkout.js" async />

      <div className="min-h-screen pb-16">
        {/* Header */}
        <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-gray-800 z-10 px-4 py-4">
          <h1 className="text-xl font-bold text-white">Premium Plans</h1>
          <p className="text-sm text-gray-400">Unlock more tweets with a subscription</p>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Time Window Banner */}
          <div
            className={`mb-8 flex items-center gap-3 px-5 py-4 rounded-2xl border text-sm font-medium transition-all ${
              istInfo.isOpen
                ? "bg-green-950/60 border-green-700 text-green-300"
                : "bg-red-950/60 border-red-800 text-red-300"
            }`}
          >
            <Clock className="h-5 w-5 flex-shrink-0" />
            <div>
              {istInfo.isOpen ? (
                <>
                  <span className="font-bold text-green-400">Payment window is OPEN</span>
                  {" · "}Current IST time: {istInfo.timeStr}
                </>
              ) : (
                <>
                  <span className="font-bold text-red-400">Payment window is CLOSED</span>
                  {" · "}Payments accepted only between{" "}
                  <span className="font-bold">10:00 AM – 11:00 AM IST</span>
                  {". "}Current time: {istInfo.timeStr}
                </>
              )}
            </div>
          </div>

          {/* Current Usage */}
          {user && (
            <div className="mb-8 p-5 rounded-2xl border border-gray-800 bg-gray-950">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-semibold text-base">Your Current Plan</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    currentPlan === "gold"
                      ? "bg-yellow-500 text-yellow-900"
                      : currentPlan === "silver"
                      ? "bg-slate-400 text-black"
                      : currentPlan === "bronze"
                      ? "bg-amber-700 text-amber-100"
                      : "bg-gray-700 text-gray-200"
                  }`}
                >
                  {currentPlan}
                </span>
              </div>
              <div className="text-gray-400 text-sm mb-2">Tweets used this month</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      currentPlan === "gold"
                        ? "bg-yellow-500"
                        : tweetCount / planLimit >= 1
                        ? "bg-red-500"
                        : tweetCount / planLimit >= 0.8
                        ? "bg-yellow-500"
                        : "bg-blue-500"
                    }`}
                    style={{
                      width: `${
                        planLimit === Infinity ? 20 : Math.min(100, (tweetCount / planLimit) * 100)
                      }%`,
                    }}
                  />
                </div>
                <span className="text-white font-mono text-sm whitespace-nowrap">
                  {tweetCount} / {planLimit === Infinity ? "∞" : planLimit}
                </span>
              </div>
              {userPlan?.planExpiresAt && (
                <p className="text-gray-500 text-xs mt-2">
                  Plan renews:{" "}
                  {new Date(userPlan.planExpiresAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          )}

          {/* Success / Error Messages */}
          {successMsg && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-green-950/60 border border-green-700 text-green-300 text-sm">
              <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-red-950/60 border border-red-800 text-red-300 text-sm">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Plan Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {PLANS.map((plan) => {
              const Icon = plan.icon;
              const isCurrentPlan = currentPlan === plan.id;
              const isUpgrade =
                ["free", "bronze", "silver", "gold"].indexOf(plan.id) >
                ["free", "bronze", "silver", "gold"].indexOf(currentPlan);

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl border overflow-hidden transition-all hover:scale-[1.01] ${plan.border} ${
                    isCurrentPlan ? "ring-2 ring-blue-500" : ""
                  } bg-gray-950`}
                >
                  {plan.popular && (
                    <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                      POPULAR
                    </div>
                  )}
                  {isCurrentPlan && (
                    <div className="absolute top-0 left-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-br-lg">
                      ACTIVE
                    </div>
                  )}

                  {/* Card Header */}
                  <div className={`bg-gradient-to-br ${plan.color} p-5`}>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/20 rounded-xl">
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-lg">{plan.name}</h3>
                        <p className="text-white/80 text-sm">{plan.limit}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <span className="text-3xl font-black text-white">{plan.priceLabel}</span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5">
                    <ul className="space-y-2 mb-6">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-gray-300 text-sm">
                          <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => !plan.disabled && !isCurrentPlan && handleSubscribe(plan.id)}
                      disabled={
                        plan.disabled ||
                        isCurrentPlan ||
                        !isUpgrade ||
                        loading ||
                        !istInfo.isOpen
                      }
                      className={`w-full py-3 rounded-full font-bold text-sm transition-all ${
                        isCurrentPlan
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500 cursor-default"
                          : plan.disabled || !istInfo.isOpen || !isUpgrade
                          ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                          : `bg-gradient-to-r ${plan.color} text-white hover:opacity-90 active:scale-95 shadow-lg`
                      }`}
                    >
                      {isCurrentPlan
                        ? "✓ Current Plan"
                        : !istInfo.isOpen
                        ? "🔒 Window Closed"
                        : !isUpgrade
                        ? "Lower Tier"
                        : loading
                        ? "Processing…"
                        : plan.cta}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer note */}
          <p className="text-center text-gray-600 text-xs mt-8">
            Payments are accepted only between 10:00 AM – 11:00 AM IST daily.
            An invoice will be emailed to you immediately after payment.
          </p>
        </div>
      </div>
    </>
  );
}
