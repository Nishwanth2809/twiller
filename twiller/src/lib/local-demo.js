const DATA_KEY = "twiller-local-demo-data";
const SESSION_KEY = "twiller-local-demo-session";
export const localDemoEnabled = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_LOCAL_DEMO === "true";

const selfId = "000000000000000000000001";
const people = [
  { _id: selfId, username: "localdemo", displayName: "Local Demo", avatar: "", bio: "Sample account for exploring Twiller locally.", location: "", website: "", joinedDate: new Date().toISOString(), email: "demo@example.invalid", plan: "free", tweetCount: 0, planExpiresAt: null, followers: [], following: ["000000000000000000000002"], bookmarks: [], notificationsEnabled: true },
  { _id: "000000000000000000000002", username: "samplewriter", displayName: "Sample Writer", avatar: "", bio: "Sample profile for local preview.", location: "", website: "", joinedDate: new Date().toISOString(), followers: [selfId], following: [], bookmarks: [] },
  { _id: "000000000000000000000003", username: "sampleartist", displayName: "Sample Artist", avatar: "", bio: "Another sample profile.", location: "", website: "", joinedDate: new Date().toISOString(), followers: [], following: [], bookmarks: [] },
];
const posts = [
  { _id: "000000000000000000000101", author: people[1], content: "Welcome to the local Twiller demo. Posts and interactions stay in this browser.", image: "", audio: "", likes: 2, likedBy: [], retweets: 0, retweetedBy: [], replyCount: 0, parentId: null, timestamp: new Date(Date.now() - 3600000).toISOString() },
  { _id: "000000000000000000000102", author: people[2], content: "Explore the feed, try a post, and preview profiles and bookmarks.", image: "", audio: "", likes: 1, likedBy: [], retweets: 0, retweetedBy: [], replyCount: 0, parentId: null, timestamp: new Date(Date.now() - 7200000).toISOString() },
];
const fresh = () => ({ users: structuredClone(people), posts: structuredClone(posts), conversations: [], messages: [] });
function read() {
  if (typeof window === "undefined") return fresh();
  try {
    const value = JSON.parse(window.localStorage.getItem(DATA_KEY) || "null");
    if (value && Array.isArray(value.users) && Array.isArray(value.posts) && Array.isArray(value.conversations) && Array.isArray(value.messages)) return value;
  } catch { /* return sample data if local storage is unavailable */ }
  return fresh();
}
function save(value) { try { window.localStorage.setItem(DATA_KEY, JSON.stringify(value)); } catch { /* in-memory interactions remain usable */ } }
export const demoUser = () => read().users.find(user => user._id === selfId) || structuredClone(people[0]);
export const demoSessionActive = () => { try { return window.localStorage.getItem(SESSION_KEY) === "yes"; } catch { return false; } };
export function setDemoSession(active) { try { active ? window.localStorage.setItem(SESSION_KEY, "yes") : window.localStorage.removeItem(SESSION_KEY); } catch { /* current tab only */ } }
export function updateDemoUser(fields) { const value = read(); const user = value.users.find(item => item._id === selfId); Object.assign(user, fields); save(value); return user; }
const safeUser = user => user && Object.fromEntries(Object.entries(user).filter(([key]) => !["email", "plan", "bookmarks", "notificationsEnabled"].includes(key)));
const viewPost = (value, post) => post && ({ ...post, author: typeof post.author === "string" ? safeUser(value.users.find(user => user._id === post.author)) : safeUser(post.author) });
const newId = () => (Date.now().toString(16).padStart(12, "0") + Math.random().toString(16).slice(2, 14)).slice(-24);
const bodyOf = body => { if (typeof body !== "string") return body || {}; try { return JSON.parse(body); } catch { return {}; } };
const response = (config, data, headers = {}) => ({ config, data, status: 200, statusText: "OK", headers, request: {} });
function fail(config, status, code, message) {
  const result = { ...response(config, { code, error: message }), status, statusText: "Error" };
  const error = new Error(message); Object.assign(error, { config, response: result, isAxiosError: true }); throw error;
}
const capture = (path, rule) => { const match = path.match(rule); return match ? match.slice(1).map(decodeURIComponent) : []; };

export async function demoAdapter(config) {
  const value = read();
  const method = (config.method || "get").toLowerCase();
  const path = (config.url || "/").split("?")[0].replace(/\/$/, "") || "/";
  const body = bodyOf(config.data);
  const params = config.params || {};
  const me = value.users.find(user => user._id === selfId) || value.users[0];
  let data;
  let headers = {};

  if (path === "/loggedinuser" && method === "get") data = { ...me, planLimit: 10, remaining: Math.max(0, 10 - me.tweetCount), quotaStartsAt: null, quotaResetsAt: null };
  else if (["/register", "/log-session", "/logout"].includes(path)) data = path === "/log-session" ? { requiresOtp: false } : me;
  else if (path === "/feed" && method === "get") data = { tweets: value.posts.filter(post => !post.parentId).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).map(post => viewPost(value, post)), hasMore: false, nextCursor: null, page: Number(params.page || 1) };
  else if (path === "/post" && method === "get") data = value.posts.filter(post => !post.parentId).map(post => viewPost(value, post));
  else if (path === "/post" && method === "post") {
    if (!String(body.content || "").trim()) return fail(config, 400, "INVALID_INPUT", "Write something before posting.");
    const post = { _id: newId(), author: selfId, content: String(body.content).trim(), image: body.image || "", audio: body.audio || "", likes: 0, likedBy: [], retweets: 0, retweetedBy: [], replyCount: 0, parentId: null, timestamp: new Date().toISOString() };
    value.posts.push(post); me.tweetCount++; save(value); data = viewPost(value, post);
  } else if (path === "/search" && method === "get") {
    const query = String(params.q || "").trim().toLowerCase();
    data = { users: value.users.filter(user => (user.username + " " + user.displayName + " " + (user.bio || "")).toLowerCase().includes(query)).map(safeUser), tweets: value.posts.filter(post => post.content.toLowerCase().includes(query)).map(post => viewPost(value, post)) };
  } else if (path === "/suggested-users" && method === "get") data = value.users.filter(user => user._id !== me._id && !me.following.includes(user._id)).map(safeUser);
  else if (path === "/bookmarks" && method === "delete") { me.bookmarks = []; save(value); data = { success: true }; }
  else if (path.startsWith("/bookmarks/") && method === "get") data = value.posts.filter(post => me.bookmarks.includes(post._id)).map(post => viewPost(value, post));
  else if (path.startsWith("/bookmarks/") && ["put", "delete"].includes(method)) {
    const postId = capture(path, /^\/bookmarks\/([^/]+)$/)[0];
    me.bookmarks = method === "put" ? Array.from(new Set([...me.bookmarks, postId])) : me.bookmarks.filter(id => id !== postId);
    save(value); data = { bookmarks: me.bookmarks };
  } else if (path.startsWith("/userupdate/") && method === "patch") { Object.assign(me, body); save(value); data = { ...me, planLimit: 10, remaining: Math.max(0, 10 - me.tweetCount) }; }
  else if (path.startsWith("/users/") && path.endsWith("/posts") && method === "get") {
    const username = capture(path, /^\/users\/([^/]+)\/posts$/)[0] || "";
    const author = value.users.find(user => user.username.toLowerCase() === username.toLowerCase());
    data = author ? value.posts.filter(post => post.author === author._id && !post.parentId).map(post => viewPost(value, post)) : [];
  } else if (path.startsWith("/users/") && method === "get") {
    const username = capture(path, /^\/users\/([^/]+)$/)[0] || "";
    data = safeUser(value.users.find(user => user.username.toLowerCase() === username.toLowerCase()));
    if (!data) return fail(config, 404, "NOT_FOUND", "Profile not found.");
  } else if (path === "/create-order" || path === "/verify-payment") return fail(config, 503, "DEMO_UNAVAILABLE", "Payments are disabled in local demo mode.");
  else if (["/forgot-password", "/request-language-change", "/verify-language-change", "/generate-audio-otp", "/verify-login-otp", "/media-upload"].includes(path)) return fail(config, 503, "DEMO_UNAVAILABLE", "Email, verification, and upload services are disabled in local demo mode.");
  else if (path.startsWith("/post/") && path.endsWith("/replies") && method === "get") {
    const postId = capture(path, /^\/post\/([^/]+)\/replies$/)[0]; data = value.posts.filter(post => post.parentId === postId).map(post => viewPost(value, post));
  } else if (path.startsWith("/post/") && path.endsWith("/reply") && method === "post") {
    const postId = capture(path, /^\/post\/([^/]+)\/reply$/)[0]; const parent = value.posts.find(post => post._id === postId);
    if (!parent) return fail(config, 404, "NOT_FOUND", "Post not found.");
    const post = { _id: newId(), author: selfId, content: String(body.content || "").trim(), image: "", audio: "", likes: 0, likedBy: [], retweets: 0, retweetedBy: [], replyCount: 0, parentId: postId, timestamp: new Date().toISOString() };
    parent.replyCount++; value.posts.push(post); save(value); data = viewPost(value, post);
  } else if (path.startsWith("/post/") && method === "get") {
    const postId = capture(path, /^\/post\/([^/]+)$/)[0]; data = viewPost(value, value.posts.find(post => post._id === postId));
    if (!data) return fail(config, 404, "NOT_FOUND", "Post not found.");
  } else if (path.startsWith("/post/") && method === "delete") {
    const postId = capture(path, /^\/post\/([^/]+)$/)[0]; value.posts = value.posts.filter(post => post._id !== postId || post.author !== selfId); save(value); data = { success: true };
  } else if (/^\/(like|retweet)\//.test(path) && method === "post") {
    const [, action, postId] = path.match(/^\/(like|retweet)\/([^/]+)$/) || []; const post = value.posts.find(item => item._id === postId);
    if (!post) return fail(config, 404, "NOT_FOUND", "Post not found.");
    const field = action === "like" ? "likedBy" : "retweetedBy"; const count = action === "like" ? "likes" : "retweets";
    const index = post[field].indexOf(selfId); if (index >= 0) { post[field].splice(index, 1); post[count] = Math.max(0, post[count] - 1); } else { post[field].push(selfId); post[count]++; }
    save(value); data = viewPost(value, post);
  } else if (path.startsWith("/follow/") && ["post", "delete"].includes(method)) {
    const targetId = capture(path, /^\/follow\/([^/]+)$/)[0]; const target = value.users.find(user => user._id === targetId);
    if (!target) return fail(config, 404, "NOT_FOUND", "Profile not found.");
    me.following = method === "post" ? Array.from(new Set([...me.following, targetId])) : me.following.filter(id => id !== targetId);
    target.followers = method === "post" ? Array.from(new Set([...(target.followers || []), selfId])) : (target.followers || []).filter(id => id !== selfId);
    save(value); data = { success: true };
  } else if (path.startsWith("/conversations/") && path.endsWith("/messages") && method === "get") {
    const id = capture(path, /^\/conversations\/([^/]+)\/messages$/)[0]; data = { messages: value.messages.filter(message => message.conversationId === id), hasMore: false, nextCursor: null };
  } else if (path.startsWith("/conversations/") && path.endsWith("/messages") && method === "post") {
    const id = capture(path, /^\/conversations\/([^/]+)\/messages$/)[0]; const message = { _id: newId(), conversationId: id, sender: safeUser(me), content: String(body.content || ""), read: false, createdAt: new Date().toISOString() };
    value.messages.push(message); const convo = value.conversations.find(item => item._id === id); if (convo) { convo.lastMessage = message.content; convo.lastMessageAt = message.createdAt; } save(value); data = message;
  } else if (path === "/conversations" && method === "post") {
    const target = value.users.find(user => user._id === body.receiverId); if (!target) return fail(config, 404, "NOT_FOUND", "Profile not found.");
    let convo = value.conversations.find(item => item.participantIds.includes(selfId) && item.participantIds.includes(target._id));
    if (!convo) { convo = { _id: newId(), participants: [safeUser(me), safeUser(target)], participantIds: [selfId, target._id], lastMessage: "", lastMessageAt: new Date().toISOString() }; value.conversations.push(convo); }
    save(value); data = convo;
  } else if (/^\/conversations\/[^/]+$/.test(path) && method === "get") {
    const id = capture(path, /^\/conversations\/([^/]+)$/)[0]; data = value.conversations.filter(item => item.participantIds.includes(id)); headers = { "x-has-more": "false", "x-next-cursor": "" };
  } else if (/^\/conversations\/[^/]+\/read$/.test(path) && method === "patch") data = { ok: true };
  else if (path.startsWith("/unread-count/") && method === "get") data = { count: 0 };
  else return fail(config, 501, "DEMO_UNSUPPORTED", "This action is unavailable in local demo mode.");
  save(value);
  return response(config, data, headers);
}
