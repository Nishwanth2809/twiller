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
    <button ref={triggerRef} type="button" aria-label="More navigation" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-1 text-xs ${["messages", "bookmarks", "subscription", "settings", "admin"].includes(currentPage) ? "text-blue-500" : "text-gray-500"}`}>
      <MoreHorizontal aria-hidden="true" className="h-6 w-6" /><span>More</span>
    </button>
    <AccessibleDialog id="mobile-more-dialog" open={open} onClose={() => setOpen(false)} labelledBy="mobile-more-title" closeOnBackdrop>
      <div className="fixed inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl border border-gray-800 bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 text-white shadow-2xl">
        <div className="mb-2 flex items-center justify-between"><h2 id="mobile-more-title" className="text-lg font-bold">More</h2><button autoFocus type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="min-h-11 min-w-11 rounded-full p-2 text-gray-400 hover:bg-gray-900 hover:text-white"><X className="h-5 w-5" /></button></div>
        {user && <button type="button" onClick={() => choose("profile")} className="mb-2 flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-gray-900"><User className="h-5 w-5 text-gray-400" /><span className="min-w-0 flex-1 truncate font-semibold">{user.displayName || user.username}<span className="block truncate text-sm font-normal text-gray-500">@{user.username}</span></span><span className="text-sm text-blue-400">Account</span></button>}
        <nav aria-label="Additional destinations" className="grid grid-cols-2 gap-2">
          {menuDestinations.map(({ page, label, icon: Icon }) => <button key={page} type="button" aria-current={currentPage === page ? "page" : undefined} onClick={() => choose(page)} className={`flex min-h-12 items-center gap-3 rounded-lg border border-gray-800 px-3 text-left hover:bg-gray-900 ${currentPage === page ? "text-blue-400" : "text-white"}`}><Icon aria-hidden="true" className="h-5 w-5 shrink-0" />{label}</button>)}
        </nav>
        {user && <button type="button" onClick={() => { setOpen(false); setConfirmLogout(true); }} className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-red-400 hover:bg-gray-900"><LogOut className="h-5 w-5" />Log out</button>}
      </div>
    </AccessibleDialog>
    {confirmLogout && <ConfirmLogoutDialog onClose={() => setConfirmLogout(false)} onConfirm={() => { void logout(); }} />}
  </>;
}
