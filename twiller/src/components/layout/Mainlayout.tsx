"use client";

import { useAuth } from "@/context/AuthContext";
import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import LoadingSpinner, { LoadingSplash } from "../loading-spinner";
import Sidebar from "./Sidebar";
import RightSidebar from "./Rightsidebar";
import ProfilePage from "../ProfilePage";
import SubscriptionPage from "../SubscriptionPage";
import BookmarksPage from "../BookmarksPage";
import ExplorePage from "../ExplorePage";
import NotificationsPage from "../NotificationsPage";
import SettingsPage from "../SettingsPage";
import MessagesPage from "../MessagesPage";
import AdminPage from "../AdminPage";
import TweetComposer from "../TweetComposer";
import axiosInstance from "@/lib/axiosInstance";
import MobileMoreMenu from "./MobileMoreMenu";
import KeyboardShortcuts from "../KeyboardShortcuts";
import AccessibleDialog from "../ui/AccessibleDialog";
import TopBar from "./TopBar";
import BrandLogo from "../BrandLogo";

// Floating composer modal
function ComposerModal({ onClose, onPosted }: { onClose: () => void; onPosted: (t: any) => void }) {
  return (
    <AccessibleDialog open onClose={onClose} labelledBy="composer-dialog-title" closeOnBackdrop>
      <div className="mt-8 w-full max-w-xl rounded-2xl border border-gray-800 bg-black text-white shadow-2xl">
        <div className="flex items-center justify-end px-4 pt-3 pb-1">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-full p-2 text-white transition-colors hover:bg-gray-900 hover:text-gray-300"
            aria-label="Close composer"
          >
            ✕
          </button>
        </div>
        <h2 id="composer-dialog-title" className="sr-only">Create a post</h2>
        <TweetComposer
          onTweetPosted={(t: any) => {
            onPosted(t);
            onClose();
          }}
        />
      </div>
    </AccessibleDialog>
  );
}

type Page =
  | "home"
  | "explore"
  | "search"
  | "notifications"
  | "messages"
  | "bookmarks"
  | "profile"
  | "settings"
  | "subscription"
  | "admin";

const Mainlayout = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, status, refreshUser, isDemoMode } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [showComposer, setShowComposer] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?._id) { setUnreadCount(0); return; }
    let active = true;
    const refreshUnread = async () => {
      try { const res = await axiosInstance.get(`/unread-count/${user._id}`); if (active) setUnreadCount(Number(res.data.count) || 0); } catch { /* preserve last known count */ }
    };
    void refreshUnread();
    window.addEventListener("twiller:unread-count-changed", refreshUnread);
    window.addEventListener("focus", refreshUnread);
    return () => { active = false; window.removeEventListener("twiller:unread-count-changed", refreshUnread); window.removeEventListener("focus", refreshUnread); };
  }, [user?._id]);

  useEffect(() => {
    const refreshEntitlements = () => { void refreshUser().catch(() => {}); };
    window.addEventListener("focus", refreshEntitlements);
    return () => window.removeEventListener("focus", refreshEntitlements);
  }, [refreshUser]);

  useEffect(() => {
    const sync = () => {
      if (window.location.pathname === "/search") { setCurrentPage("search"); return; }
      if (window.location.pathname === "/explore") { setCurrentPage("explore"); return; }
      if (window.location.pathname === "/settings") { setCurrentPage("settings"); return; }
      const requested = new URLSearchParams(window.location.search).get("view") as Page | null;
      const pages: Page[] = ["home", "explore", "search", "notifications", "messages", "bookmarks", "profile", "settings", "subscription", "admin"];
      if (requested && pages.includes(requested)) setCurrentPage(requested);
      else setCurrentPage("home");
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [pathname]);

  if (isLoading && status === "initializing") {
    return <LoadingSplash message="Connecting to your network..." />;
  }

  const navigate = (page: string) => {
    const [kind, value] = page.split("/");
    if (kind === "user" && value) { router.push(`/${encodeURIComponent(value)}`); return; }
    if (kind === "status" && value) { router.push(`/status/${encodeURIComponent(value)}`); return; }
    const target = (kind === "profile" && user ? "profile" : kind) as Page;
    const pages: Page[] = ["home", "explore", "search", "notifications", "messages", "bookmarks", "profile", "settings", "subscription", "admin"];
    if (!pages.includes(target)) return;
    if (!user && target !== "home" && target !== "search") { router.push("/"); return; }
    if (target === "admin" && user?.role !== "admin") { router.push("/"); return; }
    setShowComposer(false);
    setCurrentPage(target);
    router.push(target === "home" ? "/" : target === "search" ? "/search" : target === "explore" ? "/explore" : `/?view=${target}`, { scroll: false });
  };

  if (!user) {
    return <>
      <KeyboardShortcuts canCompose={false} onNavigate={navigate} onOpenComposer={() => {}} />
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { onNavigate: navigate }) : children}
    </>;
  }

  const renderPage = () => {
    switch (currentPage) {
      case "profile":
        return <ProfilePage />;
      case "subscription":
        return <SubscriptionPage />;
      case "bookmarks":
        return <BookmarksPage onNavigate={navigate} />;
      case "explore":
        return <ExplorePage onNavigate={navigate} />;
      case "search":
        return <ExplorePage onNavigate={navigate} />;
      case "notifications":
        return <NotificationsPage onNavigate={navigate} />;
      case "settings":
        return <SettingsPage onNavigate={navigate} />;
      case "messages":
        return <MessagesPage onNavigate={navigate} />;
      case "admin":
        return user?.role === "admin" ? <AdminPage /> : <ProfilePage />;
      default: {
        // Home — pass onNavigate to children via cloneElement
        if (React.isValidElement(children)) {
          return React.cloneElement(children as React.ReactElement<any>, {
            onNavigate: navigate,
          });
        }
        return children;
      }
    }
  };

  return (
    <>
      <KeyboardShortcuts canCompose onNavigate={navigate} onOpenComposer={() => setShowComposer(true)} />
      {showComposer && (
        <ComposerModal
          key={user?._id || "public"}
          onClose={() => setShowComposer(false)}
          onPosted={(tweet) => { window.dispatchEvent(new CustomEvent("twiller:post-created", { detail: tweet })); setShowComposer(false); }}
        />
      )}

      <a href="#main-content" className="sr-only z-[100] rounded-md bg-white px-4 py-2 font-semibold text-black focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">Skip to main content</a>
      <div className={isDemoMode ? "twiller-app twiller-demo" : "twiller-app"}>
        {isDemoMode && <div role="status" className="fixed top-0 inset-x-0 z-50 bg-amber-300 text-black text-center text-xs font-semibold px-3 py-1">LOCAL DEMO · Sample data only · External services disabled</div>}
        <TopBar onNavigate={navigate} onOpenComposer={() => setShowComposer(true)} onSearch={(query) => {
          setShowComposer(false);
          setCurrentPage("search");
          router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/search", { scroll: false });
        }} />
      <div className="twiller-workspace">
        {/* Left sidebar — hidden on mobile, visible on md+ */}
        <div className="twiller-rail hidden md:block">
          <Sidebar
            currentPage={currentPage}
            unreadCount={unreadCount}
            onNavigate={navigate}
            onOpenComposer={() => setShowComposer(true)}
          />
        </div>

        {/* Main content */}
        <main id="main-content" tabIndex={-1} className="twiller-center flex-1 w-full min-w-0 pb-24 md:pb-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
          {renderPage()}
        </main>

        {/* Right sidebar — only on large screens */}
        <aside aria-label="Discovery" className="twiller-discovery hidden xl:block">
          <div className="sticky top-0">
            <RightSidebar onNavigate={navigate} />
          </div>
        </aside>
      </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label="Primary navigation" className="twiller-mobile-nav fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-md border-t border-border flex items-center justify-around py-2 z-40 md:hidden safe-area-pb">
        <button
          onClick={() => navigate("home")}
          className={`relative p-3 rounded-full transition-colors flex flex-col items-center min-h-[44px] min-w-[44px] justify-center ${currentPage === "home" ? "text-primary font-bold" : "text-text-muted hover:text-text"}`}
          aria-label="Home"
          aria-current={currentPage === "home" ? "page" : undefined}
        >
          <svg className="h-6 w-6" fill={currentPage === "home" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          {currentPage === "home" && <span className="absolute bottom-1 size-1 rounded-full bg-primary" />}
        </button>
        <button
          onClick={() => navigate("explore")}
          className={`relative p-3 rounded-full transition-colors flex flex-col items-center min-h-[44px] min-w-[44px] justify-center ${(currentPage === "explore" || currentPage === "search") ? "text-primary font-bold" : "text-text-muted hover:text-text"}`}
          aria-label="Discover"
          aria-current={(currentPage === "explore" || currentPage === "search") ? "page" : undefined}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          {(currentPage === "explore" || currentPage === "search") && <span className="absolute bottom-1 size-1 rounded-full bg-primary" />}
        </button>
        <button
          onClick={() => setShowComposer(true)}
          className="p-3 bg-primary hover:bg-primary-hover active:scale-95 rounded-full text-white transition-all shadow-md shadow-primary/30 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Create new post"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
        <button
          onClick={() => navigate("notifications")}
          className={`relative p-3 rounded-full transition-colors flex flex-col items-center min-h-[44px] min-w-[44px] justify-center ${currentPage === "notifications" ? "text-primary font-bold" : "text-text-muted hover:text-text"}`}
          aria-label="Activity"
          aria-current={currentPage === "notifications" ? "page" : undefined}
        >
          <svg className="h-6 w-6" fill={currentPage === "notifications" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 size-2 rounded-full bg-primary ring-2 ring-background" />
          )}
          {currentPage === "notifications" && <span className="absolute bottom-1 size-1 rounded-full bg-primary" />}
        </button>
        <button
          onClick={() => navigate("profile")}
          className={`relative p-3 rounded-full transition-colors flex flex-col items-center min-h-[44px] min-w-[44px] justify-center ${currentPage === "profile" ? "text-primary font-bold" : "text-text-muted hover:text-text"}`}
          aria-label="Profile"
          aria-current={currentPage === "profile" ? "page" : undefined}
        >
          <svg className="h-6 w-6" fill={currentPage === "profile" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          {currentPage === "profile" && <span className="absolute bottom-1 size-1 rounded-full bg-primary" />}
        </button>
        <MobileMoreMenu currentPage={currentPage} onNavigate={navigate} />
      </nav>
    </>
  );
};

export default Mainlayout;
