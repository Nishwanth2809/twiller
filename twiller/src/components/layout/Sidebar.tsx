"use client";

import React, { useEffect, useRef, useState } from "react";

import {
  Home,
  Search,
  Bell,
  Mail,
  Bookmark,
  User,
  MoreHorizontal,
  Settings,
  LogOut,
  Crown,
  Shield,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import ConfirmLogoutDialog from "../ConfirmLogoutDialog";
import { useAuth } from "@/context/AuthContext";

interface SidebarProps {
  currentPage?: string;
  onNavigate?: (page: string) => void;
  onOpenComposer?: () => void;
  unreadCount?: number;
}

const PLAN_COLORS: Record<string, string> = {
  free: "text-gray-400",
  bronze: "text-amber-500",
  silver: "text-slate-300",
  gold: "text-yellow-400",
};

export default function Sidebar({
  currentPage = "home",
  onNavigate,
  unreadCount = 0,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const accountMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreMenuFocus = useRef(false);

  useEffect(() => {
    if (!confirmLogout && restoreMenuFocus.current) {
      restoreMenuFocus.current = false;
      accountMenuTriggerRef.current?.focus();
    }
  }, [confirmLogout]);

  const navigation = [
    { name: "Home", icon: Home, current: currentPage === "home", page: "home" },
    { name: "Discover", icon: Search, current: currentPage === "explore" || currentPage === "search", page: "explore" },
    {
      name: "Activity",
      icon: Bell,
      current: currentPage === "notifications",
      page: "notifications",
    },
    { name: "Messages", icon: Mail, current: currentPage === "messages", page: "messages" },
    { name: "Saved", icon: Bookmark, current: currentPage === "bookmarks", page: "bookmarks" },
    { name: "Profile", icon: User, current: currentPage === "profile", page: "profile" },
    {
      name: "Premium",
      icon: Crown,
      current: currentPage === "subscription",
      page: "subscription",
      planColor: user ? PLAN_COLORS[user.plan || "free"] : "text-gray-400",
    },
    ...(user?.role === "admin"
      ? [
          {
            name: "Admin",
            icon: Shield,
            current: currentPage === "admin",
            page: "admin",
            planColor: "text-rose-400 hover:text-rose-300 font-semibold",
          },
        ]
      : []),
  ];

  return (
    <div className="twiller-sidebar flex flex-col w-full sticky top-0">
      <p className="twiller-rail-heading hidden lg:block">Workspace</p>

      <nav aria-label="Primary navigation" className="flex-1 px-2">
        <ul className="space-y-1">
          {navigation.map((item) => (
            <li key={item.name}>
              <Button
                variant="ghost"
                className={`twiller-nav-item w-full justify-start text-sm min-h-12 px-3 rounded-xl transition-all ${
                  item.current
                    ? "font-bold text-primary bg-primary-soft/60 hover:bg-primary-soft/80"
                    : "font-normal text-text-muted hover:text-text hover:bg-surface-hover"
                } ${(item as any).planColor ? (item as any).planColor : ""}`}
                onClick={() => onNavigate?.(item.page)}
                aria-label={item.name}
                title={item.name}
                aria-current={item.current ? "page" : undefined}
              >
                <item.icon
                  className={`lg:mr-3 h-5 w-5 flex-shrink-0 ${
                    item.current ? "text-primary" : (item as any).planColor ? (item as any).planColor : ""
                  }`}
                />
                <span className="hidden lg:inline">{item.name}</span>
                {item.page === "messages" && unreadCount > 0 && <span aria-label={`${unreadCount} unread messages`} className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-white font-semibold">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                {item.page === "subscription" && user?.plan && user.plan !== "free" && (
                  <span className="ml-2 text-xs font-bold uppercase tracking-wider opacity-80 hidden lg:inline">
                    {user.plan}
                  </span>
                )}
              </Button>
            </li>
          ))}
        </ul>

      </nav>

      {user && (
        <div className="twiller-rail-account border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start min-h-12 p-2 rounded-xl hover:bg-surface-hover transition-colors"
                aria-label="Account menu"
                ref={accountMenuTriggerRef}
              >
                <Avatar className="h-9 w-9 lg:mr-3 flex-shrink-0 ring-1 ring-border">
                  <AvatarImage src={user.avatar || undefined} alt="" />
                  <AvatarFallback aria-hidden="true" className="bg-primary-soft text-primary font-bold">
                    {user.displayName ? user.displayName[0] : user.username ? user.username[0] : "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left hidden lg:block min-w-0">
                  <div className="text-text font-semibold truncate">{user.displayName}</div>
                  <div className="text-text-muted text-sm truncate">@{user.username}</div>
                </div>
                <MoreHorizontal className="h-5 w-5 text-text-muted hidden lg:block flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-surface border-border text-text shadow-2xl">
              <DropdownMenuItem
                className="text-text hover:bg-surface-hover cursor-pointer gap-2"
                onClick={() => onNavigate?.("profile")}
              >
                <User className="h-4 w-4" />
                View Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-text hover:bg-surface-hover cursor-pointer gap-2"
                onClick={() => onNavigate?.("settings")}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                className="text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer gap-2"
                onClick={() => {
                  restoreMenuFocus.current = true;
                  setConfirmLogout(true);
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out @{user.username}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {confirmLogout && <ConfirmLogoutDialog onClose={() => setConfirmLogout(false)} onConfirm={() => { void logout(); }} />}
    </div>
  );
}
