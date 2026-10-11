"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Search, Send, ArrowLeft, Edit, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import axiosInstance from "@/lib/axiosInstance";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { RowSkeleton } from "./ui/Skeletons";
import AccessibleDialog from "./ui/AccessibleDialog";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Participant {
  _id: string;
  username: string;
  displayName: string;
  avatar: string;
}

interface Conversation {
  _id: string;
  participants: Participant[];
  lastMessage: string;
  lastMessageAt: string;
  lastMessageSender?: { _id: string; username: string };
}

interface Message {
  _id: string;
  sender: Participant;
  content: string;
  createdAt: string;
  read: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-us", { month: "short", day: "numeric" });
}

function formatMessageTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-us", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── New Message Modal ─────────────────────────────────────────────────────────

function NewMessageModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (user: Participant) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Participant[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSequence = useRef(0);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); searchSequence.current++; }, []);

  const handleSearch = (q: string) => {
    setQuery(q);
    setSearchFailed(false);
    setResults([]);
    const sequence = ++searchSequence.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axiosInstance.get("/search", { params: { q } });
        if (searchSequence.current === sequence) setResults(res.data.users || []);
      } catch { if (searchSequence.current === sequence) { setResults([]); setSearchFailed(true); } }
      finally { if (searchSequence.current === sequence) setSearching(false); }
    }, 350);
  };

  return (
    <AccessibleDialog open onClose={onClose} labelledBy="new-message-title" closeOnBackdrop>
      <div className="mt-12 w-full max-w-lg rounded-2xl border border-gray-800 bg-black text-white shadow-2xl">
        <div className="flex items-center px-4 py-3 border-b border-gray-800">
          <button type="button" aria-label="Close new message" onClick={onClose} className="mr-3 min-h-11 min-w-11 rounded-full p-2 hover:bg-gray-900">
            <X aria-hidden="true" className="h-5 w-5 text-white" />
          </button>
          <h2 id="new-message-title" className="text-xl font-bold text-white flex-1">New message</h2>
        </div>
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400" />
            <label htmlFor="new-message-search" className="sr-only">Search people to message</label>
            <input
              id="new-message-search"
              autoFocus
              type="text"
              placeholder="Search people"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full bg-transparent text-white placeholder-gray-500 pl-10 py-2 border-0 focus:outline-none text-sm"
            />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {searching && <p role="status" className="text-gray-500 text-sm p-4">Searching...</p>}
          {!searching && query && results.length === 0 && (
            <p role={searchFailed ? "alert" : undefined} className={`${searchFailed ? "text-red-400" : "text-gray-500"} text-sm p-4`}>{searchFailed ? "Search failed. Try again." : `No results for “${query}”`}</p>
          )}
          {results.map((u) => (
            <button
              type="button"
              key={u._id}
              onClick={() => onSelect(u)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-900 transition-colors"
            >
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarImage src={u.avatar || undefined} alt="" />
                <AvatarFallback aria-hidden="true" className="bg-gray-800 text-white">{u.displayName?.[0]}</AvatarFallback>
              </Avatar>
              <div className="text-left">
                <div className="text-white font-semibold">{u.displayName}</div>
                <div className="text-gray-500 text-sm">@{u.username}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </AccessibleDialog>
  );
}

// ─── Chat View ─────────────────────────────────────────────────────────────────

function ChatView({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderCursorRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const preserveHistoryScrollRef = useRef(false);
  const previousScrollHeightRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchingRef = useRef(false);
  const activeRef = useRef(true);
  const stickToBottomRef = useRef(true);
  const readPendingRef = useRef(false);

  const other = conversation.participants.find((p) => p._id !== user?._id);

  useEffect(() => {
    setMessages([]);
    messagesRef.current = [];
    olderCursorRef.current = null;
    setHasOlder(false);
    readPendingRef.current = false;
  }, [conversation._id]);

  const fetchMessages = useCallback(async () => {
    if (fetchingRef.current || !activeRef.current || document.visibilityState !== "visible") return;
    fetchingRef.current = true;
    try {
      const res = await axiosInstance.get(`/conversations/${conversation._id}/messages`);
      const page: Message[] = res.data.messages || [];
      const initialPage = messagesRef.current.length === 0;
      const hasNewIncoming = page.some(message => message.sender._id !== user?._id && !messagesRef.current.some(old => old._id === message._id));
      if (hasNewIncoming) readPendingRef.current = true;
      setMessages(previous => {
        const merged = new Map(previous.map(message => [message._id, message]));
        for (const message of page) {
          const optimistic = [...merged.values()].find(old => old._id.startsWith("opt-") && old.sender._id === message.sender._id && old.content === message.content);
          if (optimistic) merged.delete(optimistic._id);
          merged.set(message._id, message);
        }
        const ordered = [...merged.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        messagesRef.current = ordered;
        return ordered;
      });
      if (initialPage) olderCursorRef.current = res.data.nextCursor;
      setHasOlder(Boolean(res.data.hasMore) && Boolean(olderCursorRef.current));
      if (readPendingRef.current && document.visibilityState === "visible" && user?._id) {
        await axiosInstance.patch(`/conversations/${conversation._id}/read`, { userId: user._id });
        readPendingRef.current = false;
        window.dispatchEvent(new Event("twiller:unread-count-changed"));
      }
    } catch { /* silent */ }
    finally { fetchingRef.current = false; }
  }, [conversation._id, user?._id]);

  const loadOlder = async () => {
    if (!olderCursorRef.current || loadingOlder) return;
    previousScrollHeightRef.current = messagesContainerRef.current?.scrollHeight || 0;
    preserveHistoryScrollRef.current = true;
    setLoadingOlder(true);
    try {
      const res = await axiosInstance.get(`/conversations/${conversation._id}/messages`, { params: { cursor: olderCursorRef.current, limit: 50 } });
      const page: Message[] = res.data.messages || [];
      setMessages(previous => {
        const merged = new Map([...page, ...previous].map(message => [message._id, message]));
        const ordered = [...merged.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        messagesRef.current = ordered;
        return ordered;
      });
      olderCursorRef.current = res.data.nextCursor;
      setHasOlder(Boolean(res.data.hasMore));
    } catch { /* retain the current history and cursor for retry */ }
    finally { setLoadingOlder(false); }
  };

  useEffect(() => {
    fetchMessages();
    activeRef.current = true;
    pollRef.current = setInterval(fetchMessages, 3000);
    const onVisibility = () => { if (document.visibilityState === "visible") { fetchMessages(); } };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { activeRef.current = false; if (pollRef.current) clearInterval(pollRef.current); document.removeEventListener("visibilitychange", onVisibility); };
  }, [conversation._id, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (preserveHistoryScrollRef.current && container) {
      container.scrollTop += container.scrollHeight - previousScrollHeightRef.current;
      preserveHistoryScrollRef.current = false;
      return;
    }
    if (stickToBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !input.trim() || sending) return;
    const content = input.trim();
    setSendError("");
    stickToBottomRef.current = true;
    setInput("");
    setSending(true);

    // Optimistic message
    const optimistic: Message = {
      _id: `opt-${Date.now()}`,
      sender: { _id: user._id, username: user.username, displayName: user.displayName, avatar: user.avatar },
      content,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await axiosInstance.post(`/conversations/${conversation._id}/messages`, {
        senderId: user._id,
        content,
      });
      // Replace optimistic with real
      setMessages((prev) => [...prev.filter((m) => m._id !== optimistic._id && m._id !== res.data._id), res.data].sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    } catch {
      // Remove optimistic on failure
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
      setInput(content);
      setSendError("Message could not be sent. Your draft is ready to retry.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <button type="button" aria-label="Back to conversations" onClick={onBack} className="min-h-11 min-w-11 rounded-full p-2 hover:bg-gray-900 md:hidden transition-colors">
          <ArrowLeft aria-hidden="true" className="h-5 w-5 text-white" />
        </button>
        {other && (
          <>
            <Avatar className="h-10 w-10">
              <AvatarImage src={other.avatar || undefined} alt="" />
              <AvatarFallback aria-hidden="true" className="bg-gray-800 text-white">{other.displayName?.[0]}</AvatarFallback>
            </Avatar>
            <div>
              <div className="text-white font-bold">{other.displayName}</div>
              <div className="text-gray-500 text-sm">@{other.username}</div>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div role="log" aria-label={other ? `Conversation with ${other.displayName}` : "Conversation messages"} aria-live="polite" aria-relevant="additions" ref={messagesContainerRef} onScroll={(event) => { const node = event.currentTarget; stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120; }} className="flex-1 overflow-y-auto p-4 space-y-3">
        {hasOlder && (
          <div className="text-center">
            <Button type="button" variant="ghost" onClick={loadOlder} disabled={loadingOlder} className="text-blue-400">
              {loadingOlder ? "Loading…" : "Load older messages"}
            </Button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="text-center py-12">
            {other && (
              <>
                <Avatar className="h-20 w-20 mx-auto mb-4">
                  <AvatarImage src={other.avatar || undefined} alt="" />
                  <AvatarFallback aria-hidden="true" className="bg-gray-800 text-white text-2xl">{other.displayName?.[0]}</AvatarFallback>
                </Avatar>
                <h3 className="text-white text-xl font-bold">{other.displayName}</h3>
                <p className="text-gray-500 text-sm mt-1">@{other.username}</p>
                <p className="text-gray-500 text-sm mt-4">
                  This is the beginning of your conversation with {other.displayName}.
                </p>
              </>
            )}
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.sender._id === user?._id;
          const showDate =
            i === 0 ||
            new Date(msg.createdAt).toDateString() !==
              new Date(messages[i - 1].createdAt).toDateString();

          return (
            <div key={msg._id}>
              {showDate && (
                <div className="text-center text-xs text-gray-600 my-3">
                  {new Date(msg.createdAt).toLocaleDateString("en-us", {
                    weekday: "short", month: "short", day: "numeric",
                  })}
                </div>
              )}
              <div className={`flex ${isMe ? "justify-end" : "justify-start"} items-end gap-2`}>
                {!isMe && (
                  <Avatar className="h-8 w-8 flex-shrink-0 mb-1">
                    <AvatarImage src={msg.sender.avatar || undefined} alt="" />
                    <AvatarFallback aria-hidden="true" className="bg-gray-800 text-white text-xs">{msg.sender.displayName?.[0]}</AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-xs lg:max-w-sm group relative`}>
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                      isMe
                        ? "bg-blue-500 text-white rounded-br-sm"
                        : "bg-gray-800 text-white rounded-bl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <div
                    className={`text-xs text-gray-500 mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity ${
                      isMe ? "text-right" : "text-left"
                    }`}
                  >
                    <time dateTime={msg.createdAt}>{formatMessageTime(msg.createdAt)}</time>
                    {isMe && (
                      <span className="ml-1">{msg.read ? " · Read" : ""}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} aria-busy={sending} className="flex items-center gap-3 px-4 py-3 border-t border-gray-800 flex-shrink-0">
        <div className="flex-1 bg-gray-900 rounded-full px-4 py-2.5 flex items-center">
          <label htmlFor="message-compose" className="sr-only">Send a message</label>
          <input
            id="message-compose"
            type="text"
            placeholder="Start a new message"
            autoComplete="off"
            aria-invalid={Boolean(sendError)}
            aria-describedby={sendError ? "message-send-error" : undefined}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={1000}
            className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm"
          />
        </div>
        <Button
          type="submit"
          disabled={!input.trim() || sending}
          className="h-11 w-11 p-0 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 flex-shrink-0 transition-colors"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
      {sendError && <p id="message-send-error" role="alert" className="px-4 pb-3 text-sm text-red-400">{sendError}</p>}
    </div>
  );
}

// ─── Conversation List ─────────────────────────────────────────────────────────

function ConversationList({
  conversations,
  selectedId,
  currentUserId,
  onSelect,
  onNewMessage,
  onLoadMore,
  hasMore,
  loadingMore,
  loading,
}: {
  conversations: Conversation[];
  selectedId?: string;
  currentUserId: string;
  onSelect: (c: Conversation) => void;
  onNewMessage: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <h1 className="text-xl font-bold text-white">Messages</h1>
        <button
          onClick={onNewMessage}
          className="p-2 rounded-full hover:bg-gray-900 transition-colors text-blue-400"
          aria-label="New message"
        >
          <Edit className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <RowSkeleton count={3} className="space-y-0" />
        )}

        {!loading && conversations.length === 0 && (
          <div className="py-16 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
              <Send className="h-7 w-7 text-blue-400" />
            </div>
        <h2 className="text-xl font-bold text-white mb-2">No messages yet</h2>
            <p className="text-gray-500 text-sm mb-6">
              Start a conversation with anyone on Twiller.
            </p>
            <button
              onClick={onNewMessage}
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-full text-sm transition-colors"
            >
              New message
            </button>
          </div>
        )}

        {conversations.map((convo) => {
          const other = convo.participants.find((p) => p._id !== currentUserId);
          const isSelected = convo._id === selectedId;
          const isMe = convo.lastMessageSender?._id === currentUserId;
          return (
            <button
              type="button"
              key={convo._id}
              onClick={() => onSelect(convo)}
              aria-pressed={isSelected}
              className={`w-full flex items-center gap-3 px-4 py-4 border-b border-gray-800 hover:bg-gray-950/60 transition-colors text-left ${
                isSelected ? "bg-gray-900" : ""
              }`}
            >
              <Avatar className="h-12 w-12 flex-shrink-0">
                <AvatarImage src={other?.avatar || undefined} alt="" />
                <AvatarFallback aria-hidden="true" className="bg-gray-800 text-white">
                  {other?.displayName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-white font-semibold truncate">{other?.displayName}</span>
                  {convo.lastMessageAt && (
                    <span className="text-gray-500 text-xs flex-shrink-0 ml-2">
                      {formatTime(convo.lastMessageAt)}
                    </span>
                  )}
                </div>
                <p className="text-gray-500 text-sm truncate mt-0.5">
                  {convo.lastMessage ? (
                    <>{isMe && <span className="text-gray-400">You: </span>}{convo.lastMessage}</>
                  ) : (
                    <span className="italic">Say hello!</span>
                  )}
                </p>
              </div>
            </button>
          );
        })}
        {hasMore && <div className="p-3 text-center"><Button type="button" variant="ghost" onClick={onLoadMore} disabled={loadingMore} className="text-blue-400">{loadingMore ? "Loading…" : "Load more conversations"}</Button></div>}
      </div>
    </div>
  );
}

// ─── Main MessagesPage ─────────────────────────────────────────────────────────

export default function MessagesPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewMsg, setShowNewMsg] = useState(false);
  // On mobile, show either list or chat
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const conversationCursor = useRef<string | null>(null);
  const conversationPageInitialized = useRef(false);

  useEffect(() => {
    setConversations([]);
    setSelected(null);
    conversationCursor.current = null;
    conversationPageInitialized.current = false;
    setHasMoreConversations(false);
  }, [user?._id]);

  const fetchConversations = useCallback(async () => {
    if (!user?._id) return;
    try {
      const res = await axiosInstance.get(`/conversations/${user._id}`, { params: { limit: 50 } });
      const page: Conversation[] = res.data || [];
      setConversations(previous => {
        const merged = new Map([...previous, ...page].map(conversation => [conversation._id, conversation]));
        const ordered = [...merged.values()].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        return ordered;
      });
      if (!conversationPageInitialized.current) {
        conversationCursor.current = res.headers?.["x-next-cursor"] || null;
        setHasMoreConversations(res.headers?.["x-has-more"] === "true");
        conversationPageInitialized.current = true;
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [user?._id]);

  const loadMoreConversations = async () => {
    if (!user?._id || !conversationCursor.current || loadingMoreConversations) return;
    setLoadingMoreConversations(true);
    try {
      const res = await axiosInstance.get(`/conversations/${user._id}`, { params: { limit: 50, cursor: conversationCursor.current } });
      const page: Conversation[] = res.data || [];
      setConversations(previous => {
        const merged = new Map([...previous, ...page].map(conversation => [conversation._id, conversation]));
        const ordered = [...merged.values()].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        return ordered;
      });
      conversationCursor.current = res.headers?.["x-next-cursor"] || null;
      setHasMoreConversations(res.headers?.["x-has-more"] === "true" && Boolean(conversationCursor.current));
    } catch { /* keep the existing list and cursor for retry */ }
    finally { setLoadingMoreConversations(false); }
  };

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // Poll conversations list every 5s
  useEffect(() => {
    const id = setInterval(fetchConversations, 5000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  const handleSelectConversation = (convo: Conversation) => {
    setSelected(convo);
    setMobileView("chat");
  };

  const handleNewMessageUser = async (targetUser: Participant) => {
    setShowNewMsg(false);
    if (!user?._id) return;
    try {
      const res = await axiosInstance.post("/conversations", {
        senderId: user._id,
        receiverId: targetUser._id,
      });
      const convo = res.data;
      // Add to list if not already there
      setConversations((prev) =>
        prev.find((c) => c._id === convo._id) ? prev : [convo, ...prev]
      );
      setSelected(convo);
      setMobileView("chat");
    } catch (err) {
      console.error("Failed to open conversation:", err);
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      {showNewMsg && (
        <NewMessageModal
          onClose={() => setShowNewMsg(false)}
          onSelect={handleNewMessageUser}
        />
      )}

      {/* Conversation list — always visible on desktop, hidden on mobile when chat is open */}
      <div
        className={`${
          mobileView === "chat" ? "hidden md:flex" : "flex"
        } flex-col border-r border-gray-800 md:w-80 w-full flex-shrink-0`}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selected?._id}
          currentUserId={user._id}
          onSelect={handleSelectConversation}
          onNewMessage={() => setShowNewMsg(true)}
          onLoadMore={loadMoreConversations}
          hasMore={hasMoreConversations}
          loadingMore={loadingMoreConversations}
          loading={loading}
        />
      </div>

      {/* Chat view */}
      <div
        className={`${
          mobileView === "list" ? "hidden md:flex" : "flex"
        } flex-col flex-1`}
      >
        {selected ? (
          <ChatView
            key={selected._id}
            conversation={selected}
            onBack={() => { setMobileView("list"); setSelected(null); }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full border-2 border-gray-700 flex items-center justify-center mx-auto mb-4">
                <Send className="h-8 w-8 text-gray-600" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Select a message</h2>
              <p className="text-gray-500 text-sm mb-6 max-w-xs">
                Choose from your existing conversations or start a new one.
              </p>
              <button
                onClick={() => setShowNewMsg(true)}
                className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-full text-sm transition-colors"
              >
                New message
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
