"use client";

import type { FormEvent } from "react";
import { Bell, SquarePen, Search } from "lucide-react";
import BrandLogo from "../BrandLogo";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { useAuth } from "@/context/AuthContext";

export default function TopBar({ onNavigate, onSearch, onOpenComposer }: {
  onNavigate: (page: string) => void;
  onSearch: (query: string) => void;
  onOpenComposer: () => void;
}) {
  const { user } = useAuth();
  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("q");
    onSearch(typeof query === "string" ? query.trim() : "");
  };
  return <header className="twiller-topbar">
    <div className="twiller-topbar-inner">
      <button type="button" aria-label="Twiller Home" className="twiller-brand-link" onClick={() => onNavigate("home")}><BrandLogo size="md" wordmark decorative /></button>
      <form role="search" aria-label="Global search" className="twiller-global-search" onSubmit={search}>
        <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
        <input name="q" aria-label="Search" placeholder="Search Twiller" autoComplete="off" maxLength={100} />
        <button type="submit" aria-label="Search people and posts" className="twiller-search-submit"><Search aria-hidden="true" className="h-4 w-4" /></button>
      </form>
      <button type="button" aria-label="Create new post" className="twiller-create" onClick={onOpenComposer}><SquarePen aria-hidden="true" className="h-4 w-4" /><span>Create</span></button>
      <button type="button" aria-label="Open Activity" className="twiller-top-activity" onClick={() => onNavigate("notifications")}><Bell aria-hidden="true" className="h-5 w-5" /></button>
      <button type="button" aria-label="View your profile" className="twiller-top-account" onClick={() => onNavigate("profile")}>
        <Avatar className="h-9 w-9"><AvatarImage src={user?.avatar || undefined} alt="" /><AvatarFallback aria-hidden="true">{user?.displayName?.[0] || user?.username?.[0] || "T"}</AvatarFallback></Avatar>
      </button>
    </div>
  </header>;
}
