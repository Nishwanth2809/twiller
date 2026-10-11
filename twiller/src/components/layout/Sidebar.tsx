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
                className={`twiller-nav-item w-full justify-start text-sm min-h-12 px-3 rounded-xl hover:bg-gray-900 transition-colors ${
                  item.current ? "font-bold" : "font-normal"
                } ${(item as any).planColor ? (item as any).planColor : "text-white hover:text-white"}`}
                onClick={() => onNavigate?.(item.page)}
                aria-label={item.name}
                title={item.name}
                aria-current={item.current ? "page" : undefined}
              >
                <item.icon
                  className={`lg:mr-3 h-5 w-5 flex-shrink-0 ${
                    (item as any).planColor ? (item as any).planColor : ""
                  }`}
                />
                <span className="hidden lg:inline">{item.name}</span>
                {item.page === "messages" && unreadCount > 0 && <span aria-label={`${unreadCount} unread messages`} className="ml-2 rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
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
        <div className="twiller-rail-account border-t border-gray-800">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start min-h-12 p-2 rounded-xl hover:bg-gray-900 transition-colors"
                aria-label="Account menu"
                ref={accountMenuTriggerRef}
              >
                <Avatar className="h-9 w-9 lg:mr-3 flex-shrink-0">
                  <AvatarImage src={user.avatar || undefined} alt="" />
                  <AvatarFallback aria-hidden="true" className="bg-gray-800 text-white">
                    {user.displayName ? user.displayName[0] : user.username ? user.username[0] : "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left hidden lg:block min-w-0">
                  <div className="text-white font-semibold truncate">{user.displayName}</div>
                  <div className="text-gray-400 text-sm truncate">@{user.username}</div>
                </div>
                <MoreHorizontal className="h-5 w-5 text-gray-400 hidden lg:block flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-black border-gray-800 shadow-2xl">
              <DropdownMenuItem
                className="text-white hover:bg-gray-900 cursor-pointer gap-2"
                onClick={() => onNavigate?.("profile")}
              >
                <User className="h-4 w-4" />
                View Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-white hover:bg-gray-900 cursor-pointer gap-2"
                onClick={() => onNavigate?.("settings")}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-800" />
              <DropdownMenuItem
                className="text-white hover:bg-gray-900 cursor-pointer gap-2"
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
