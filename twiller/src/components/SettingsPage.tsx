"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User, Bell, Shield, LogOut, ChevronRight,
  Eye, Lock, CreditCard
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useTheme } from "@/context/ThemeContext";
import type { ThemePreference } from "@/context/ThemeContext";
import ConfirmLogoutDialog from "./ConfirmLogoutDialog";

interface SettingsSection {
  label: string;
  icon: React.ReactNode;
  description?: string;
  action?: () => void;
  danger?: boolean;
  href?: string;
  disabled?: boolean;
}

export default function SettingsPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const router = useRouter();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const sections: { heading: string; items: SettingsSection[] }[] = [
    {
      heading: "Your account",
      items: [
        {
          label: "View your profile",
          icon: <User className="h-5 w-5" />,
          description: "Review your public profile and edit supported profile details",
          action: () => onNavigate?.("profile"),
        },
        {
          label: "Reset your password",
          icon: <Lock className="h-5 w-5" />,
          description: "Request a secure password reset link by email",
          action: () => router.push("/forgot-password"),
        },
        {
          label: "Subscription & billing",
          icon: <CreditCard className="h-5 w-5" />,
          description: "View your current plan, usage, and available plans",
          action: () => onNavigate?.("subscription"),
        },
      ],
    },
    {
      heading: "Security & privacy",
      items: [
        {
          label: "Privacy and safety",
          icon: <Shield className="h-5 w-5" />,
          description: "Read how Twiller handles your information",
          href: "/privacy",
        },
        {
          label: "Two-factor authentication",
          icon: <Eye className="h-5 w-5" />,
          description: "Two-factor authentication is not available yet",
          disabled: true,
        },
      ],
    },
    {
      heading: "Activity",
      items: [
        {
          label: "Activity",
          icon: <Bell className="h-5 w-5" />,
          description: "Review likes, follows, replies, and mentions",
          action: () => onNavigate?.("notifications"),
        },
      ],
    },
    {
      heading: "More",
      items: [
        {
          label: "Terms of service",
          icon: <Shield className="h-5 w-5" />,
          description: "Read the terms that apply to Twiller",
          href: "/terms",
        },
        {
          label: "Privacy policy",
          icon: <Shield className="h-5 w-5" />,
          description: "Read the Twiller privacy policy",
          href: "/privacy",
        },
        {
          label: "Log out",
          icon: <LogOut className="h-5 w-5" />,
          action: () => setConfirmLogout(true),
          danger: true,
        },
      ],
    },
  ];

  const frequentlyAsked = [
    { question: "How do I reset my password?", answer: "Use Reset your password to request a secure link by email. Google sign-in accounts can continue using Google." },
    { question: "How do I update my profile?", answer: "Open your profile and choose Edit profile. Supported profile changes are saved to your account." },
    { question: "How does Activity work?", answer: "The Activity page shows follows, likes, echoes, replies, and mentions. Open an item to mark it read." },
    { question: "Do paid plans renew automatically?", answer: "No. Paid plans are one-time purchases with the allowance and duration shown on the Subscription page." },
  ];

  return (
    <div className="min-h-screen">
      {/* Logout confirm dialog */}
      {confirmLogout && <ConfirmLogoutDialog onClose={() => setConfirmLogout(false)} onConfirm={() => { void logout(); }} />}

      <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-gray-800 z-10 px-4 py-3">
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>

      {/* User card */}
      {user && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`View profile for ${user.displayName || user.username}`}
          className="flex w-full items-center gap-3 p-4 border-b border-gray-800 text-left hover:bg-gray-950/50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          onClick={() => onNavigate?.("profile")}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onNavigate?.("profile"); }
          }}
        >
          <Avatar className="h-14 w-14">
            <AvatarImage src={user.avatar || undefined} alt="" />
            <AvatarFallback aria-hidden="true" className="bg-gray-800 text-white text-xl">
              {user.displayName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold">{user.displayName}</div>
            <div className="text-gray-500 text-sm">@{user.username}</div>
            <div className="text-gray-500 text-xs">{user.email}</div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-600" />
        </div>
      )}

      <section aria-labelledby="appearance-heading" className="border-b border-gray-800 px-4 py-4">
        <h2 id="appearance-heading" className="mb-3 text-base font-bold text-blue-400">Appearance</h2>
        <label htmlFor="theme-preference" className="mb-2 block text-sm font-semibold text-white">Theme</label>
        <p className="mb-3 text-sm text-gray-500">Choose light or dark, or follow your device setting.</p>
        <select id="theme-preference" value={preference} onChange={event => setPreference(event.target.value as ThemePreference)} className="min-h-11 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:max-w-xs">
          <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
        </select>
      </section>

      <section aria-labelledby="help-heading" className="border-b border-gray-800 px-4 py-4">
        <h2 id="help-heading" className="mb-3 text-base font-bold text-blue-400">Quick answers</h2>
        <div className="divide-y divide-gray-800 rounded-lg border border-gray-800">
          {frequentlyAsked.map(item => <details key={item.question} className="group px-4 py-3">
            <summary className="cursor-pointer list-none pr-6 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">{item.question}<span aria-hidden="true" className="float-right text-gray-500 group-open:rotate-45">+</span></summary>
            <p className="pt-3 text-sm leading-6 text-gray-400">{item.answer}</p>
          </details>)}
        </div>
      </section>

      {/* Settings sections */}
      {sections.map((section) => (
        <div key={section.heading}>
          <div className="px-4 py-3 bg-black">
            <h2 className="text-base font-bold text-blue-400">{section.heading}</h2>
          </div>
          {section.items.map((item) => {
            const className = `w-full flex items-center gap-4 px-4 py-4 border-b border-gray-800 transition-colors text-left ${item.disabled ? "cursor-not-allowed opacity-60" : "hover:bg-gray-950/50"} ${item.danger ? "text-red-400 hover:bg-red-900/10" : ""}`;
            const contents = <>
              <div className={`flex-shrink-0 ${item.danger ? "text-red-400" : "text-gray-400"}`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-medium ${item.danger ? "text-red-400" : "text-white"}`}>
                  {item.label}
                </div>
                {item.description && (
                  <div className="text-gray-500 text-sm">{item.description}</div>
                )}
              </div>
              {!item.danger && !item.disabled && <ChevronRight className="h-5 w-5 text-gray-600 flex-shrink-0" />}
            </>;
            if (item.href) return <Link key={item.label} href={item.href} className={className}>{contents}</Link>;
            return <button key={item.label} type="button" onClick={item.action} disabled={item.disabled} className={className}>{contents}</button>;
          })}
        </div>
      ))}

      <div className="p-6 text-center text-gray-600 text-xs space-y-1">
        <p>Twiller © 2025</p>
        <p>Built with ❤️</p>
      </div>
    </div>
  );
}
