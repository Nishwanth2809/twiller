"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import axiosInstance from "@/lib/axiosInstance";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import AccessibleDialog from "./ui/AccessibleDialog";
import {
  ShieldAlert,
  Search,
  Lock,
  Unlock,
  Trash2,
  Eye,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  UserCheck,
  Shield,
  FileText,
} from "lucide-react";

interface AdminUserItem {
  _id: string;
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  location?: string;
  website?: string;
  joinedDate: string;
  role: "user" | "admin";
  accountStatus: "active" | "suspended" | "frozen" | "deleted";
  followers?: string[];
  following?: string[];
}

interface UserDetailStats {
  user: AdminUserItem;
  stats: {
    rootPosts: number;
    replies: number;
    totalPublicPosts: number;
  };
}

export default function AdminPage() {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Inspect User Modal
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetailStats | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Status Change Dialog (Freeze / Resume)
  const [statusTarget, setStatusTarget] = useState<{ user: AdminUserItem; newStatus: "active" | "frozen" | "suspended" } | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Delete User Dialog
  const [deleteTarget, setDeleteTarget] = useState<AdminUserItem | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const fetchUsers = useCallback(async (reset = false, search = searchQuery) => {
    try {
      setLoading(true);
      setActionError("");
      const params: Record<string, any> = { limit: 20 };
      if (!reset && nextCursor) params.cursor = nextCursor;
      if (search.trim()) params.q = search.trim();

      const res = await axiosInstance.get<{ users: AdminUserItem[]; hasMore: boolean; nextCursor: string | null }>(
        "/admin/users",
        { params }
      );
      if (reset) {
        setUsers(res.data.users);
      } else {
        setUsers(prev => [...prev, ...res.data.users]);
      }
      setHasMore(res.data.hasMore);
      setNextCursor(res.data.nextCursor);
    } catch (err: any) {
      console.error("Failed to load admin users", err);
      setActionError(err.response?.data?.message || "Failed to load platform users");
    } finally {
      setLoading(false);
    }
  }, [nextCursor, searchQuery]);

  useEffect(() => {
    fetchUsers(true);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(true, searchQuery);
  };

  const openUserDetails = async (targetId: string) => {
    try {
      setDetailLoading(true);
      const res = await axiosInstance.get<UserDetailStats>(`/admin/users/${targetId}`);
      setSelectedUserDetail(res.data);
    } catch (err: any) {
      setActionError(err.response?.data?.message || "Failed to fetch user details");
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    try {
      setStatusSubmitting(true);
      setActionError("");
      await axiosInstance.patch(`/admin/users/${statusTarget.user._id}/status`, {
        status: statusTarget.newStatus,
        reason: statusReason.trim() || undefined,
      });

      setUsers(prev =>
        prev.map(u => (u._id === statusTarget.user._id ? { ...u, accountStatus: statusTarget.newStatus } : u))
      );
      setActionSuccess(`Account status for @${statusTarget.user.username} updated to ${statusTarget.newStatus}`);
      setStatusTarget(null);
      setStatusReason("");
      setTimeout(() => setActionSuccess(""), 4000);
    } catch (err: any) {
      setActionError(err.response?.data?.message || "Could not update account status");
    } finally {
      setStatusSubmitting(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteSubmitting(true);
      setActionError("");
      await axiosInstance.delete(`/admin/users/${deleteTarget._id}`, {
        data: { reason: deleteReason.trim() || undefined },
      });

      setUsers(prev => prev.filter(u => u._id !== deleteTarget._id));
      setActionSuccess(`Account @${deleteTarget.username} has been deleted.`);
      setDeleteTarget(null);
      setDeleteReason("");
      setTimeout(() => setActionSuccess(""), 4000);
    } catch (err: any) {
      setActionError(err.response?.data?.message || "Could not delete user account");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">Active</span>;
      case "frozen":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">Frozen</span>;
      case "suspended":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-950/60 border border-amber-500/30 text-amber-400">Suspended</span>;
      case "deleted":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-900 border border-gray-700 text-gray-400">Deleted</span>;
      default:
        return <span className="text-xs text-gray-500">{status}</span>;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 text-text">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-text">Admin Moderation Console</h1>
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-950/80 border border-rose-500/40 text-rose-300">
              <Shield className="w-3.5 h-3.5" /> Staff
            </span>
          </div>
          <p className="text-sm text-text-muted mt-1">
            Manage platform members and moderate public community content safely.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchUsers(true)}
          className="border-border text-text hover:text-text hover:bg-surface-hover gap-1.5 self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Privacy Notice Banner */}
      <div className="my-5 p-4 rounded-xl bg-primary-soft/50 border border-primary/20 text-xs sm:text-sm text-primary flex items-start gap-3">
        <Lock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-primary">Zero-DM Privacy Guarantee</p>
          <p className="text-text-muted mt-0.5">
            Admin endpoints operate exclusively on public records (posts, profiles, follower relations). Private direct messages (DMs), OTPs, and password credentials are isolated by strict security boundaries and cannot be viewed or modified by administrators.
          </p>
        </div>
      </div>

      {/* Action feedback */}
      {actionSuccess && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-rose-950/80 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          {actionError}
        </div>
      )}

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2 my-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by username or display name..."
            className="pl-10 bg-surface border-border text-text placeholder-text-muted focus-visible:ring-primary"
          />
        </div>
        <Button type="submit" className="bg-primary hover:bg-primary-hover text-on-primary">
          Search
        </Button>
      </form>

      {/* Users List */}
      <div className="mt-4 rounded-xl border border-border bg-surface overflow-hidden shadow-xl">
        {loading && users.length === 0 ? (
          <div className="py-12 text-center text-text-muted">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-text-muted" />
            Loading platform accounts...
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-text-muted">
            No accounts found matching your search.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {users.map(u => {
              const isSelf = u._id === currentAdmin?._id;
              const isOtherAdmin = u.role === "admin" && !isSelf;

              return (
                <div key={u._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-hover transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="w-10 h-10 border border-border shrink-0">
                      <AvatarImage src={u.avatar} />
                      <AvatarFallback className="bg-surface-hover text-text font-medium">
                        {u.displayName?.[0] || u.username?.[0] || "U"}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-text truncate">{u.displayName || u.username}</span>
                        <span className="text-text-muted text-sm truncate">@{u.username}</span>
                        {u.role === "admin" && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-950/80 border border-purple-500/40 text-purple-300">
                            Admin
                          </span>
                        )}
                        {getStatusBadge(u.accountStatus)}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        Joined {new Date(u.joinedDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openUserDetails(u._id)}
                      title="Inspect Public Overview"
                      className="text-text-muted hover:text-text hover:bg-surface-hover p-2 h-9 w-9"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>

                    {!isSelf && !isOtherAdmin && (
                      <>
                        {u.accountStatus === "frozen" || u.accountStatus === "suspended" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStatusTarget({ user: u, newStatus: "active" })}
                            className="border-emerald-700/50 text-emerald-400 hover:bg-emerald-950/50 hover:text-emerald-300 text-xs gap-1 h-8"
                          >
                            <Unlock className="w-3.5 h-3.5" /> Resume
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStatusTarget({ user: u, newStatus: "frozen" })}
                            className="border-cyan-700/50 text-cyan-400 hover:bg-cyan-950/50 hover:text-cyan-300 text-xs gap-1 h-8"
                          >
                            <Lock className="w-3.5 h-3.5" /> Freeze
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(u)}
                          title="Delete User Account"
                          className="text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 p-2 h-9 w-9"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}

                    {isSelf && (
                      <span className="text-xs text-text-muted italic pr-2">Your Account</span>
                    )}
                    {isOtherAdmin && (
                      <span className="text-xs text-purple-400/80 italic pr-2">Protected Admin</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div className="p-4 border-t border-border text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchUsers(false)}
              disabled={loading}
              className="border-border text-text hover:text-text hover:bg-surface-hover"
            >
              {loading ? "Loading..." : "Load More Accounts"}
            </Button>
          </div>
        )}
      </div>

      {/* Inspect User Dialog */}
      <AccessibleDialog
        open={Boolean(selectedUserDetail)}
        onClose={() => setSelectedUserDetail(null)}
        labelledBy="user-detail-dialog-title"
        closeOnBackdrop
      >
        <div className="mt-8 w-full max-w-md rounded-2xl border border-border bg-surface text-text p-6 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h2 id="user-detail-dialog-title" className="text-lg font-bold flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" /> Account Inspection
            </h2>
            <button
              onClick={() => setSelectedUserDetail(null)}
              className="text-text-muted hover:text-text text-sm p-1 rounded-full"
            >
              ✕
            </button>
          </div>

          {selectedUserDetail && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12 border border-border">
                  <AvatarImage src={selectedUserDetail.user.avatar} />
                  <AvatarFallback className="bg-surface-hover text-text text-lg">
                    {selectedUserDetail.user.displayName?.[0] || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold text-text text-base">{selectedUserDetail.user.displayName}</p>
                  <p className="text-text-muted text-sm">@{selectedUserDetail.user.username}</p>
                </div>
              </div>

              {selectedUserDetail.user.bio && (
                <p className="text-sm text-text bg-surface-hover/50 p-2.5 rounded-lg border border-border">
                  {selectedUserDetail.user.bio}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-surface-hover/50 border border-border">
                  <p className="text-text-muted">Account Role</p>
                  <p className="font-semibold text-text mt-0.5 capitalize">{selectedUserDetail.user.role}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-hover/50 border border-border">
                  <p className="text-text-muted">Status</p>
                  <p className="font-semibold text-text mt-0.5 capitalize">{selectedUserDetail.user.accountStatus}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-hover/50 border border-border">
                  <p className="text-text-muted">Root Posts</p>
                  <p className="font-semibold text-text mt-0.5">{selectedUserDetail.stats.rootPosts}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-hover/50 border border-border">
                  <p className="text-text-muted">Replies</p>
                  <p className="font-semibold text-text mt-0.5">{selectedUserDetail.stats.replies}</p>
                </div>
              </div>

              <div className="text-[11px] text-text-muted border-t border-border pt-3">
                Security boundary verified: Private messaging (DMs) are intentionally segregated and completely excluded from admin inspection.
              </div>
            </div>
          )}
        </div>
      </AccessibleDialog>

      {/* Freeze / Resume Status Dialog */}
      <AccessibleDialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        labelledBy="status-dialog-title"
        closeOnBackdrop
      >
        <div className="mt-8 w-full max-w-md rounded-2xl border border-border bg-surface text-text p-6 shadow-2xl">
          <h2 id="status-dialog-title" className="text-lg font-bold">
            {statusTarget?.newStatus === "active" ? "Resume Account" : "Freeze Account"}
          </h2>
          <p className="text-sm text-text-muted mt-2">
            {statusTarget?.newStatus === "active"
              ? `Restore full account mutation privileges for @${statusTarget?.user.username}.`
              : `Freeze account for @${statusTarget?.user.username}. The user will be signed out and prevented from publishing posts, replies, likes, or updates.`}
          </p>

          <div className="mt-4">
            <label className="text-xs text-text-muted block mb-1">Moderation Reason (Optional)</label>
            <Input
              type="text"
              placeholder="e.g. Terms of Service investigation"
              value={statusReason}
              onChange={e => setStatusReason(e.target.value)}
              className="bg-surface-hover/50 border-border text-text placeholder-text-muted"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setStatusTarget(null)}
              className="text-text-muted hover:text-text"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmStatusChange}
              disabled={statusSubmitting}
              className={statusTarget?.newStatus === "active" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-cyan-600 hover:bg-cyan-500 text-white"}
            >
              {statusSubmitting ? "Updating..." : "Confirm"}
            </Button>
          </div>
        </div>
      </AccessibleDialog>

      {/* Delete User Dialog */}
      <AccessibleDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        labelledBy="delete-dialog-title"
        closeOnBackdrop
      >
        <div className="mt-8 w-full max-w-md rounded-2xl border border-rose-900/50 bg-surface text-text p-6 shadow-2xl">
          <div className="flex items-center gap-3 text-rose-400 mb-2">
            <AlertTriangle className="w-6 h-6" />
            <h2 id="delete-dialog-title" className="text-lg font-bold">
              Permanently Delete Account
            </h2>
          </div>
          <p className="text-sm text-text mt-1">
            Are you sure you want to delete <span className="font-bold text-text">@{deleteTarget?.username}</span>?
          </p>
          <ul className="text-xs text-text-muted list-disc list-inside mt-3 space-y-1">
            <li>Session and authentication tokens will be immediately revoked.</li>
            <li>Stand-alone posts will be permanently purged.</li>
            <li>Posts with replies will be tombstoned to preserve conversation trees.</li>
            <li>Followers and following links will be unlinked.</li>
          </ul>

          <div className="mt-4">
            <label className="text-xs text-text-muted block mb-1">Deletion Reason (Required for audit)</label>
            <Input
              type="text"
              placeholder="e.g. Repeated harassment or platform abuse"
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              className="bg-surface-hover/50 border-border text-text placeholder-text-muted"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              className="text-text-muted hover:text-text"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDeleteUser}
              disabled={deleteSubmitting}
              className="bg-rose-600 hover:bg-rose-500 text-white"
            >
              {deleteSubmitting ? "Deleting..." : "Delete Account"}
            </Button>
          </div>
        </div>
      </AccessibleDialog>
    </div>
  );
}
