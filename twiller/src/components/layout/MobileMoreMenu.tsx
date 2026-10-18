"use client";

import { useRef, useState } from "react";
import { Bookmark, Crown, LogOut, Mail, MoreHorizontal, Settings, User, X, Shield } from "lucide-react";
import ConfirmLogoutDialog from "../ConfirmLogoutDialog";
import AccessibleDialog from "../ui/AccessibleDialog";
import { useAuth } from "@/context/AuthContext";

const destinations = [
  { page: "messages", label: "Messages", icon: Mail },
  { page: "bookmarks", label: "Saved", icon: Bookmark },
  { page: "subscription", label: "Subscription", icon: Crown },
  { page: "settings", label: "Settings", icon: Settings },
];

export default function MobileMoreMenu({ currentPage, onNavigate }: { currentPage: string; onNavigate: (page: string) => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const menuDestinations = [
    ...destinations,
    ...(user?.role === "admin" ? [{ page: "admin", label: "Admin", icon: Shield }] : []),
  ];

  const choose = (page: string) => { setOpen(false); onNavigate(page); };
  return <>
    <button
      ref={triggerRef}
      type="button"
      aria-label="More navigation"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
      className={`relative p-2.5 rounded-full transition-colors flex flex-col items-center min-h-[44px] min-w-[44px] justify-center ${["messages", "bookmarks", "subscription", "settings", "admin"].includes(currentPage) ? "text-primary font-bold" : "text-text-muted hover:text-text"}`}
    >
      <MoreHorizontal aria-hidden="true" className="h-6 w-6" />
      <span className="sr-only">More</span>
      {["messages", "bookmarks", "subscription", "settings", "admin"].includes(currentPage) && (
        <span className="absolute bottom-1 size-1 rounded-full bg-primary" />
      )}
    </button>
    <AccessibleDialog id="mobile-more-dialog" open={open} onClose={() => setOpen(false)} labelledBy="mobile-more-title" closeOnBackdrop>
      <div className="fixed inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl border border-border bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 text-text shadow-2xl">
        <div className="mb-2 flex items-center justify-between"><h2 id="mobile-more-title" className="text-lg font-bold">More</h2><button autoFocus type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="min-h-11 min-w-11 rounded-full p-2 text-text-muted hover:bg-surface-hover hover:text-text"><X className="h-5 w-5" /></button></div>
        {user && <button type="button" onClick={() => choose("profile")} className="mb-2 flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-surface-hover"><User className="h-5 w-5 text-text-muted" /><span className="min-w-0 flex-1 truncate font-semibold">{user.displayName || user.username}<span className="block truncate text-sm font-normal text-text-muted">@{user.username}</span></span><span className="text-sm text-primary">Account</span></button>}
        <nav aria-label="Additional destinations" className="grid grid-cols-2 gap-2">
          {menuDestinations.map(({ page, label, icon: Icon }) => <button key={page} type="button" aria-current={currentPage === page ? "page" : undefined} onClick={() => choose(page)} className={`flex min-h-12 items-center gap-3 rounded-lg border border-border px-3 text-left hover:bg-surface-hover ${currentPage === page ? "text-primary" : "text-text"}`}><Icon aria-hidden="true" className="h-5 w-5 shrink-0" />{label}</button>)}
        </nav>
        {user && <button type="button" onClick={() => { setOpen(false); setConfirmLogout(true); }} className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-error hover:bg-surface-hover"><LogOut className="h-5 w-5" />Log out</button>}
      </div>
    </AccessibleDialog>
    {confirmLogout && <ConfirmLogoutDialog onClose={() => setConfirmLogout(false)} onConfirm={() => { void logout(); }} />}
  </>;
}
