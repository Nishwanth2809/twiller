import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(new URL("../../twiller/package.json", import.meta.url));
const ts = require("typescript");
const jsx = require("react/jsx-runtime");
function compile(relative, overrides) {
  const filename = new URL(`../../twiller/src/${relative}`, import.meta.url);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const skeletons = { SkeletonBlock: "SkeletonBlock", PostSkeleton: "PostSkeleton", RowSkeleton: "RowSkeleton" };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: filename.pathname })(name => name in overrides ? overrides[name] : name === "./ui/Skeletons" ? skeletons : name.endsWith("/ui/AccessibleDialog") ? "AccessibleDialog" : ["./TopicSelector", "./TopicChips", "./TopicsDirectory", "./CircleSelector", "./CircleChip", "./CirclesDirectory", "./CircleCreateDialog"].includes(name) ? { __esModule: true, default: name.slice(2) } : require(name), module, module.exports);
  return module.exports;
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function hooks() {
  const slots = []; let index = 0; let idCounter = 0; const effects = [];
  return {
    reset() { index = 0; }, effects,
    react: { createContext: () => ({ Provider: "provider" }), useContext: () => null,
      useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
      useRef(initial) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
      useCallback(callback) { index++; return callback; },
      useMemo(factory) { index++; return factory(); },
      useId() { return `test-id-${++idCounter}`; },
      useEffect(effect) { const i = index++; if (!(i in slots)) { slots[i] = true; effects.push(effect); } },
    },
  };
}
function findElement(node, predicate) {
  if (Array.isArray(node)) { for (const item of node) { const found = findElement(item, predicate); if (found) return found; } return undefined; }
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  return findElement(node.props?.children, predicate);
}
function elementText(node) {
  if (Array.isArray(node)) return node.map(elementText).join("");
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  return elementText(node.props?.children);
}

const topicFixture = (index = 1) => ({ _id: String(index).padStart(24, "0"), slug: `topic-${index}`, name: `Topic ${index}`, description: "Real description", status: "active", following: false });
const settleTopics = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };

test("Topic chips link to topic routes without activating their parent post card", () => {
  const { default: Chips } = compile("components/TopicChips.tsx", { "react/jsx-runtime": jsx, "next/link": "a" });
  let stopped = 0; const link = findElement(Chips({ topics: [topicFixture()] }), node => node.type === "a");
  assert.equal(link.props.href, "/topic/topic-1"); assert.equal(elementText(link), "Topic 1");
  link.props.onClick({ stopPropagation() { stopped++; } }); link.props.onKeyDown({ stopPropagation() { stopped++; } }); assert.equal(stopped, 2);
  assert.equal(Chips({ topics: [] }), null);
});
test("Topic follow controls use owner-free requests, server state, duplicate-submit protection and recoverable errors", async () => {
  const h = hooks(), pending = deferred(), calls = []; let changed;
  const { default: Follow } = compile("components/TopicFollowButton.tsx", {
    react: h.react, "react/jsx-runtime": jsx, "@/context/AuthContext": { useAuth: () => ({ user: { _id: "owner" } }) },
    "@/lib/axiosInstance": { __esModule: true, default: { put: (...args) => { calls.push(args); return pending.promise; }, delete: async (...args) => { calls.push(args); throw Error("offline"); } } },
  });
  const render = () => { h.reset(); return Follow({ topic: topicFixture(), onChange: value => { changed = value; } }); };
  let tree = render(); const cleanup = h.effects[0]();
  let button = findElement(tree, node => node.type === "button"); assert.equal(button.props["aria-pressed"], false);
  button.props.onClick(); button.props.onClick(); assert.equal(calls.length, 1); assert.deepEqual(calls[0], [`/topics/${topicFixture()._id}/follow`]);
  pending.resolve({ data: { following: true } }); await settleTopics(); tree = render();
  button = findElement(tree, node => node.type === "button"); assert.equal(button.props["aria-pressed"], true); assert.equal(changed.following, true);
  button.props.onClick(); await settleTopics(); tree = render(); assert.match(elementText(tree), /Could not update/); assert.equal(findElement(tree, node => node.type === "button").props["aria-pressed"], true);
  cleanup();
});
test("Discover Topics keeps loading, content, empty and error states distinct and uses the existing retry cursor", async () => {
  const previousTimeout = globalThis.setTimeout, previousClear = globalThis.clearTimeout;
  globalThis.setTimeout = action => { action(); return 0; }; globalThis.clearTimeout = () => {};
  try {
    for (const scenario of ["content", "empty", "error"]) {
      const h = hooks(), pending = deferred(); let config;
      const { appendUniquePage } = compile("lib/profile-posts.ts", {});
      const { default: Directory } = compile("components/TopicsDirectory.tsx", {
        react: h.react, "react/jsx-runtime": jsx, "next/link": "a", "./TopicFollowButton": "Follow",
        "@/lib/profile-posts": { appendUniquePage }, "@/context/AuthContext": { useAuth: () => ({ user: { _id: "owner" } }) },
        "@/lib/axiosInstance": { __esModule: true, default: { get: (_path, params) => { config = params; return pending.promise; } } },
      });
      const render = () => { h.reset(); return Directory({ query: "react" }); };
      let tree = render(); assert.ok(findElement(tree, node => node.type === "RowSkeleton")); h.effects[0]();
      if (scenario === "error") pending.reject(Error("offline")); else pending.resolve({ data: { topics: scenario === "content" ? [topicFixture()] : [], hasMore: false, nextCursor: null } });
      await settleTopics(); tree = render(); assert.equal(config.params.q, "react"); assert.equal(findElement(tree, node => node.type === "RowSkeleton"), undefined);
      if (scenario === "content") { assert.equal(findElement(tree, node => node.type === "a").props.href, "/topic/topic-1"); assert.ok(findElement(tree, node => node.type === "Follow")); }
      else if (scenario === "error") { assert.ok(findElement(tree, node => node.props?.role === "alert")); assert.match(elementText(tree), /Retry topics/); assert.doesNotMatch(elementText(tree), /No matching/); }
      else assert.match(elementText(tree), /No matching topics/);
    }
  } finally { globalThis.setTimeout = previousTimeout; globalThis.clearTimeout = previousClear; }
});
test("Topic selector supports optional selection/removal, disables a fourth topic and preserves search errors", async () => {
  const topicLibrary = compile("lib/topics.ts", {}), pageLibrary = compile("lib/profile-posts.ts", {});
  assert.equal(topicLibrary.selectTopic([topicFixture(), topicFixture(2), topicFixture(3)], topicFixture(4)).length, 3);
  assert.deepEqual(topicLibrary.selectTopic([], { ...topicFixture(), status: "disabled" }), []);
  assert.equal(topicLibrary.selectTopic([topicFixture()], topicFixture()).length, 1);
  const h = hooks(); let selected = [topicFixture(), topicFixture(2), topicFixture(3)], effect, fail = false;
  h.react.useEffect = callback => { effect = callback; };
  const { default: Selector } = compile("components/TopicSelector.tsx", {
    react: h.react, "react/jsx-runtime": jsx, "@/lib/topics": topicLibrary, "@/lib/profile-posts": pageLibrary,
    "@/lib/axiosInstance": { __esModule: true, default: { get: async () => { if (fail) throw Error("offline"); return { data: { topics: [topicFixture(4)], hasMore: false, nextCursor: null } }; } } },
  });
  const render = () => { h.reset(); return Selector({ selected, onChange: value => { selected = value; } }); };
  let tree = render(); findElement(tree, node => node.props?.["aria-label"] === "Remove topic Topic 1").props.onClick(); assert.equal(selected.length, 2);
  selected = [topicFixture(), topicFixture(2), topicFixture(3)];
  findElement(render(), node => node.props?.["aria-expanded"] !== undefined).props.onClick(); tree = render();
  assert.match(elementText(tree), /Three topics selected/); assert.equal(findElement(tree, node => node.type === "input").props.maxLength, 80);
  assert.equal(findElement(tree, node => node.props?.["aria-expanded"] !== undefined).props["aria-expanded"], true);
  const originalTimer = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  globalThis.setTimeout = callback => { callback(); return 0; }; globalThis.clearTimeout = () => {};
  try {
    let cleanup = effect(); await settleTopics(); tree = render();
    assert.equal(findElement(tree, node => node.type === "button" && elementText(node) === "Topic 4").props.disabled, true);
    cleanup(); fail = true;
    findElement(tree, node => node.type === "input").props.onChange({ target: { value: "next" } }); tree = render(); cleanup = effect();
    await settleTopics(); tree = render(); assert.ok(findElement(tree, node => node.props?.role === "alert")); assert.doesNotMatch(elementText(tree), /No matching/);
    cleanup(); fail = false; findElement(tree, node => node.type === "button" && elementText(node) === "Retry topics").props.onClick(); tree = render(); cleanup = effect();
    await settleTopics(); tree = render(); assert.equal(findElement(tree, node => node.props?.role === "alert"), undefined); assert.match(elementText(tree), /Topic 4/); cleanup();
  } finally { globalThis.setTimeout = originalTimer; globalThis.clearTimeout = originalClear; }
  let prevented = 0; tree.props.onKeyDown({ key: "Escape", stopPropagation() { prevented++; }, preventDefault() {} }); assert.equal(prevented, 1);
  assert.equal(findElement(render(), node => node.props?.["aria-expanded"] !== undefined).props["aria-expanded"], false);
});
test("Topic page keeps loaded posts and the failed cursor, retries without duplicates, and reconciles a newly created post during load", async () => {
  const h = hooks(), initial = deferred(), calls = []; let failed = false, listener;
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  globalThis.window = { addEventListener(_event, callback) { listener = callback; }, removeEventListener() {} };
  try {
    const { appendUniquePage } = compile("lib/profile-posts.ts", {});
    const { default: Page } = compile("components/TopicPage.tsx", {
      react: h.react, "react/jsx-runtime": jsx, "next/link": "a", "./TopicFollowButton": "Follow", "./TweetCard": "Post",
      "@/lib/profile-posts": { appendUniquePage }, "@/context/AuthContext": { useAuth: () => ({ user: { _id: "owner" } }) },
      "@/lib/axiosInstance": { __esModule: true, default: { get: (path, config) => {
        if (!path.endsWith('/feed')) return Promise.resolve({ data: topicFixture() });
        calls.push(config.params);
        if (calls.length === 1) return initial.promise;
        if (!failed) { failed = true; return Promise.reject(Error("offline")); }
        return Promise.resolve({ data: { tweets: [{ _id: "first" }, { _id: "second" }], nextCursor: null, hasMore: false } });
      } } },
    });
    const render = () => { h.reset(); return Page({ slug: "topic-1" }); };
    render(); h.effects[0](); h.effects[1](); await settleTopics();
    listener({ detail: { _id: "created", topics: [topicFixture()] } });
    initial.resolve({ data: { tweets: [{ _id: "created" }, { _id: "first" }], nextCursor: "cursor1", hasMore: true } }); await settleTopics();
    let tree = render(); findElement(tree, node => node.type === "button" && elementText(node) === "Load more posts").props.onClick(); await settleTopics(); tree = render();
    assert.ok(findElement(tree, node => node.props?.role === "alert"));
    findElement(tree, node => node.type === "button" && elementText(node) === "Retry topic").props.onClick(); await settleTopics(); tree = render();
    assert.equal(calls[1].cursor, "cursor1"); assert.equal(calls[2].cursor, "cursor1"); assert.equal(findElement(tree, node => node.props?.role === "alert"), undefined);
    const postIds = []; const walk = node => { if (Array.isArray(node)) node.forEach(walk); else if (node && typeof node === "object") { if (node.type === "Post") postIds.push(node.props.tweet._id); walk(node.props?.children); } }; walk(tree);
    assert.deepEqual(postIds, ["created", "first", "second"]);
  } finally { windowDescriptor ? Object.defineProperty(globalThis, "window", windowDescriptor) : delete globalThis.window; }
});
test("Topic page shows content, true empty state, explicit error/retry and discards responses after unmount", async () => {
  for (const scenario of ["content", "empty", "error", "stale"]) {
    const h = hooks(), pending = deferred(); const { appendUniquePage } = compile("lib/profile-posts.ts", {});
    const { default: Page } = compile("components/TopicPage.tsx", {
      react: h.react, "react/jsx-runtime": jsx, "next/link": "a", "./TopicFollowButton": "Follow", "./TweetCard": "Post",
      "@/lib/profile-posts": { appendUniquePage }, "@/context/AuthContext": { useAuth: () => ({ user: { _id: "owner" } }) },
      "@/lib/axiosInstance": { __esModule: true, default: { get: path => path.endsWith('/feed') ? pending.promise : Promise.resolve({ data: topicFixture() }) } },
    });
    const render = () => { h.reset(); return Page({ slug: "topic-1" }); };
    let tree = render(); assert.ok(findElement(tree, node => node.type === "PostSkeleton")); const cleanup = h.effects[0](); await settleTopics();
    if (scenario === "stale") cleanup();
    if (scenario === "error") pending.reject(Error("offline")); else pending.resolve({ data: { tweets: scenario === "content" || scenario === "stale" ? [{ _id: "post1", content: "Post" }] : [], hasMore: false, nextCursor: null } });
    await settleTopics(); tree = render();
    if (scenario === "stale") assert.equal(findElement(tree, node => node.type === "Post"), undefined);
    else { assert.equal(findElement(tree, node => node.type === "PostSkeleton"), undefined);
      if (scenario === "content") assert.ok(findElement(tree, node => node.type === "Post"));
      else if (scenario === "error") { assert.match(elementText(tree), /Retry topic/); assert.doesNotMatch(elementText(tree), /No conversations/); }
      else assert.match(elementText(tree), /No conversations in this topic yet/);
    }
  }
});
test("shared dialog uses native modal semantics, labels, Escape handling, and focus-restoring close", () => {
  let closed = 0; let shown = 0; let closeNative = 0; let initialFocusCalls = 0; let effect; let refs = [];
  const react = {
    useRef(initial) { const ref = { current: initial }; refs.push(ref); return ref; },
    useEffect(callback) { effect = callback; },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  const body = {};
  class ReturnFocusElement { isConnected = true; focused = false; focus() { this.focused = true; } }
  const returnTarget = new ReturnFocusElement();
  globalThis.HTMLElement = ReturnFocusElement;
  globalThis.document = { body, activeElement: returnTarget };
  try {
    const { default: AccessibleDialog } = compile("components/ui/AccessibleDialog.tsx", {
      react,
      "react/jsx-runtime": jsx,
      "react-dom": { createPortal: (element, target) => ({ portalElement: element, target }) },
    });
    const tree = AccessibleDialog({
      open: true, onClose: () => closed++, id: "test-dialog", labelledBy: "test-title", describedBy: "test-description", closeOnBackdrop: true, children: "content",
    });
    const [dialogRef, closeRef] = refs;
    const dialog = findElement(tree.portalElement, node => node.type === "dialog");
    assert.equal(tree.target, body);
    assert.equal(dialog.props.role, "dialog");
    assert.equal(dialog.props["aria-modal"], "true");
    assert.equal(dialog.props["aria-labelledby"], "test-title");
    assert.equal(dialog.props["aria-describedby"], "test-description");
    const modal = { open: false, showModal() { this.open = true; shown++; }, close() { this.open = false; closeNative++; }, querySelector() { return { focus() { initialFocusCalls++; } }; } };
    dialogRef.current = modal;
    const cleanup = effect();
    assert.equal(shown, 1, "opening uses the browser's native modal and focus containment");
    assert.equal(initialFocusCalls, 1, "the marked initial control receives focus when the modal opens");
    cleanup();
    assert.equal(closeNative, 1, "closing uses the native close path so focus returns to the trigger");
    assert.equal(returnTarget.focused, true, "the previously focused trigger receives focus after dismissal");
    assert.equal(typeof closeRef.current, "function");
    dialog.props.onCancel({ preventDefault() {}, target: dialog });
    assert.equal(closed, 1, "Escape/cancel delegates to the current close callback");
    const overlay = findElement(dialog.props.children, node => node.type === "div" && typeof node.props?.onClick === "function");
    assert.ok(overlay, "dialog content wrapper handles backdrop clicks");
    overlay.props.onClick({ target: overlay, currentTarget: overlay });
    assert.equal(closed, 2, "backdrop dismissal delegates to the current close callback");
  } finally {
    previous ? Object.defineProperty(globalThis, "document", previous) : delete globalThis.document;
    previousHTMLElement ? Object.defineProperty(globalThis, "HTMLElement", previousHTMLElement) : delete globalThis.HTMLElement;
  }
});
test("changed form and navigation surfaces expose field errors, landmarks, and a skip link", () => {
  const source = relative => readFileSync(new URL(`../../twiller/src/${relative}`, import.meta.url), "utf8");
  for (const path of ["components/Authmodel.tsx", "components/Editprofile.tsx", "components/ForgotPassword.tsx"]) {
    const text = source(path);
    assert.match(text, /aria-invalid/ , `${path} marks invalid fields`);
    assert.match(text, /aria-describedby/ , `${path} associates field help/errors`);
  }
  const composer = source("components/TweetComposer.tsx");
  assert.match(composer, /Write a post/);
  assert.match(composer, /aria-describedby/);
  const postCard = source("components/TweetCard.tsx");
  assert.match(postCard, /tabIndex=\{0\}[\s\S]*aria-label=\{`Post by/);
  assert.match(postCard, /aria-label=\{`Reply, \$\{formatNumber\(tweetState\.comments\)\} replies`\}/);
  assert.match(postCard, /role=\{toastIsError \? "alert" : "status"\}/);
  const layout = source("components/layout/Mainlayout.tsx");
  assert.match(layout, /href="#main-content"/);
  assert.match(layout, /<main[^>]*id="main-content"/);
  assert.match(layout, /aria-label="Primary navigation"/);
  assert.equal((source("components/ProfilePage.tsx").match(/<h1\b/g) || []).length, 1, "profile exposes one page-level heading");
});
test("TW-022: account-menu logout requires confirmation; cancel keeps session and confirm logs out", async () => {
  const h = hooks(); let logoutCalls = 0; const navigations = [];
  const iconNames = ["Home", "Search", "Bell", "Mail", "Bookmark", "User", "MoreHorizontal", "Settings", "LogOut", "Crown", "Feather"];
  const menuNames = ["DropdownMenu", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuSeparator", "DropdownMenuTrigger"];
  const icons = Object.fromEntries(iconNames.map(name => [name, name]));
  const menus = Object.fromEntries(menuNames.map(name => [name, name]));
  const { default: Sidebar } = compile("components/layout/Sidebar.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "lucide-react": icons,
    "../ui/dropdown-menu": menus,
    "../ui/button": { Button: "Button" },
    "../ui/avatar": { Avatar: "Avatar", AvatarFallback: "AvatarFallback", AvatarImage: "AvatarImage" },
    "../ConfirmLogoutDialog": "ConfirmLogoutDialog",
    "../Twitterlogo": { __esModule: true, default: "TwitterLogo" },
    "@/context/AuthContext": { useAuth: () => ({ user: { username: "test", displayName: "Test" }, logout: async () => { logoutCalls++; } }) },
  });
  const render = () => { h.reset(); return Sidebar({ onNavigate: page => navigations.push(page) }); };
  const logoutItem = tree => findElement(tree, node => node.type === "DropdownMenuItem" && elementText(node).includes("Log out @test"));
  let tree = render();
  for (const label of ["Discover", "Activity", "Saved"]) {
    const destination = findElement(tree, node => node.type === "Button" && node.props["aria-label"] === label);
    assert.ok(destination, `${label} remains keyboard-named`); destination.props.onClick();
  }
  assert.deepEqual(navigations, ["explore", "notifications", "bookmarks"], "new labels preserve existing route identifiers");
  logoutItem(tree).props.onClick();
  tree = render();
  let dialog = findElement(tree, node => node.type === "ConfirmLogoutDialog");
  assert.ok(dialog, "logout opens the shared confirmation dialog");
  assert.equal(logoutCalls, 0, "opening confirmation does not log out");

  dialog.props.onClose();
  tree = render();
  assert.equal(findElement(tree, node => node.type === "ConfirmLogoutDialog"), undefined, "cancel closes confirmation");
  assert.equal(logoutCalls, 0, "cancel preserves the session");

  logoutItem(tree).props.onClick();
  tree = render();
  dialog = findElement(tree, node => node.type === "ConfirmLogoutDialog");
  dialog.props.onConfirm();
  await Promise.resolve();
  assert.equal(logoutCalls, 1, "logout runs only after explicit confirmation");
});
test("shared logout confirmation is an accessible alert dialog with Escape, Cancel, and explicit confirmation", async () => {
  const h = hooks(); let cancelled = 0; let confirmed = 0;
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const body = {};
  globalThis.document = { body, activeElement: null };
  try {
  const { default: Dialog } = compile("components/ConfirmLogoutDialog.tsx", { react: h.react, "react/jsx-runtime": jsx, "react-dom": { createPortal: (element, target) => ({ portalElement: element, target }) } });
  h.reset(); const tree = Dialog({ onClose: () => cancelled++, onConfirm: () => confirmed++ });
  const dialog = findElement(tree, node => node.type === "AccessibleDialog");
  assert.equal(dialog.props.role, "alertdialog");
  assert.equal(dialog.props.labelledBy, "logout-title");
  assert.equal(dialog.props.describedBy, "logout-description");
  assert.equal(dialog.props.closeOnBackdrop, true);
  const buttons = []; (function collect(node) { if (Array.isArray(node)) return node.forEach(collect); if (!node || typeof node !== "object") return; if (node.type === "button") buttons.push(node); collect(node.props?.children); })(tree);
  assert.equal(buttons[0].props.autoFocus, true);
  buttons[0].props.onClick(); assert.equal(cancelled, 1); assert.equal(confirmed, 0);
  buttons[1].props.onClick(); assert.equal(confirmed, 1);
  dialog.props.onClose(); assert.equal(cancelled, 2, "native Escape handling uses the same close callback");
  } finally {
    previousDocument ? Object.defineProperty(globalThis, "document", previousDocument) : delete globalThis.document;
  }
});
test("theme preference follows system by default and persists an explicit selection", async () => {
  const h = hooks(); const storage = new Map([["twiller-theme", "system"]]); let systemDark = false; let mediaListener;
  const saved = Object.fromEntries(["window", "document", "localStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const root = { dataset: {}, style: {}, classList: { toggle(name, enabled) { this[name] = enabled; } } };
  const media = { get matches() { return systemDark; }, addEventListener(_name, listener) { mediaListener = listener; }, removeEventListener() {} };
  globalThis.window = { matchMedia: () => media };
  globalThis.document = { documentElement: root };
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  try {
    const { ThemeProvider } = compile("context/ThemeContext.tsx", { react: h.react, "react/jsx-runtime": jsx });
    const render = () => { h.reset(); return ThemeProvider({ children: "child" }); };
    render(); await h.effects[0]();
    let tree = render(); assert.equal(tree.props.value.preference, "system"); assert.equal(root.dataset.theme, "light");
    systemDark = true; mediaListener(); assert.equal(root.dataset.theme, "dark");
    tree.props.value.setPreference("light"); assert.equal(storage.get("twiller-theme"), "light"); assert.equal(root.dataset.theme, "light");
    systemDark = true; mediaListener(); assert.equal(root.dataset.theme, "light", "system changes cannot override an explicit light choice");
    tree.props.value.setPreference("dark"); systemDark = false; mediaListener(); assert.equal(root.dataset.theme, "dark", "system changes cannot override an explicit dark choice");
    tree.props.value.setPreference("system"); assert.equal(root.dataset.theme, "light");
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});
test("free-plan summary switches to a light surface in light theme for readable contrast", () => {
  const sidebar = readFileSync(new URL("../../twiller/src/components/layout/Rightsidebar.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../twiller/src/app/globals.css", import.meta.url), "utf8");
  assert.match(sidebar, /data-twiller-plan-card=\{plan\}/, "plan card exposes its existing plan state for theme styling");
  assert.match(styles, /html\[data-theme="light"\][\s\S]*?--card:\s*#ffffff/);
  assert.match(styles, /\.twiller-discovery \[data-twiller-plan-card\][^}]*background-color:\s*var\(--card\)/, "plan summary shares the readable theme surface");
});

test("Twiller folded T brand has one accessible product name and supports decorative use", () => {
  const { default: BrandLogo } = compile("components/BrandLogo.tsx", { "react/jsx-runtime": jsx });
  const named = BrandLogo({ wordmark: true });
  assert.equal(named.props.role, "img"); assert.equal(named.props["aria-label"], "Twiller");
  assert.equal(elementText(named), "Twiller");
  const mark = findElement(named, node => node.type === "img");
  assert.equal(mark.props.src, "/brand/twiller-mark.svg");
  assert.equal(mark.props.alt, "", "the outer product name avoids duplicate logo announcements");
  const decorative = BrandLogo({ decorative: true });
  assert.equal(decorative.props["aria-hidden"], true);
  assert.equal(decorative.props.role, undefined);
});

test("Twiller top bar submits to search and preserves separate create/profile actions", () => {
  const savedFormData = Object.getOwnPropertyDescriptor(globalThis, "FormData");
  globalThis.FormData = class { constructor(form) { this.form = form; } get(name) { return this.form[name]; } };
  const searches = []; const navigations = []; let creates = 0;
  try {
    const { default: TopBar } = compile("components/layout/TopBar.tsx", {
      "react/jsx-runtime": jsx, "lucide-react": { SquarePen: "svg", Bell: "svg", Search: "svg" },
      "../BrandLogo": "BrandLogo", "../ui/avatar": { Avatar: "div", AvatarImage: "img", AvatarFallback: "span" },
      "@/context/AuthContext": { useAuth: () => ({ user: { username: "local", avatar: "http://127.0.0.1:5055/media/avatar" } }) },
    });
    const tree = TopBar({ onNavigate: page => navigations.push(page), onSearch: query => searches.push(query), onOpenComposer: () => creates++ });
    const form = findElement(tree, node => node.type === "form");
    assert.equal(form.props.role, "search");
    form.props.onSubmit({ preventDefault() {}, currentTarget: { q: "  #conversation  " } });
    assert.deepEqual(searches, ["#conversation"]); assert.equal(creates, 0);
    findElement(tree, node => node.props?.["aria-label"] === "Create new post").props.onClick();
    assert.equal(creates, 1);
    findElement(tree, node => node.props?.["aria-label"] === "View your profile").props.onClick();
    assert.deepEqual(navigations, ["profile"]);
    findElement(tree, node => node.props?.["aria-label"] === "Open Activity").props.onClick();
    assert.deepEqual(navigations, ["profile", "notifications"]);
    assert.equal(findElement(tree, node => node.type === "img").props.src, "http://127.0.0.1:5055/media/avatar");
  } finally { savedFormData ? Object.defineProperty(globalThis, "FormData", savedFormData) : delete globalThis.FormData; }
});

test("Pulse renders only server hashtag activity, links to existing search, and has honest empty/error states", async () => {
  for (const scenario of ["content", "empty", "error"]) {
    const h = hooks(); const pending = deferred(); const requests = [];
    const { default: RightSidebar } = compile("components/layout/Rightsidebar.tsx", {
      react: h.react, "react/jsx-runtime": jsx, "next/link": "a", "lucide-react": { Crown: "svg", Activity: "svg" },
      "../ui/card": { Card: "div", CardContent: "div" }, "../ui/button": { Button: "button" },
      "../ui/avatar": { Avatar: "div", AvatarFallback: "span", AvatarImage: "img" },
      "@/context/AuthContext": { useAuth: () => ({ user: null }) },
      "@/lib/axiosInstance": { __esModule: true, default: { get: url => { requests.push(url); return pending.promise; } } },
    });
    const render = () => { h.reset(); return RightSidebar({}); };
    let tree = render(); assert.match(elementText(tree), /Loading Pulse/);
    h.effects[0]();
    if (scenario === "error") pending.reject(new Error("local failure"));
    else pending.resolve({ data: scenario === "content" ? [{ tag: "conversation", count: 2 }] : [] });
    await Promise.resolve(); await Promise.resolve();
    tree = render(); assert.deepEqual(requests, ["/trending"]);
    if (scenario === "content") {
      const link = findElement(tree, node => node.type === "a" && elementText(node).includes("#conversation"));
      assert.equal(link.props.href, "/search?q=%23conversation"); assert.match(elementText(link), /2 recent posts/);
    } else assert.match(elementText(tree), scenario === "error" ? /Pulse is unavailable/ : /Nothing in Pulse yet/);
    assert.doesNotMatch(elementText(tree), /members|AI ranking|Feed Rules|Join Circle/);
  }
});
test("storage notice describes actual storage and stays dismissed after acknowledgement", async () => {
  const h = hooks(); const storage = new Map(); const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  try {
    const { default: Notice } = compile("components/CookieNotice.tsx", { react: h.react, "react/jsx-runtime": jsx, "next/link": "a" });
    const render = () => { h.reset(); return Notice(); };
    render(); await h.effects[0]();
    let tree = render(); assert.ok(findElement(tree, node => node.props?.["aria-label"] === "Browser storage notice"));
    assert.match(elementText(tree), /No analytics or marketing/);
    findElement(tree, node => node.type === "button").props.onClick();
    tree = render(); assert.equal(tree, null); assert.equal(storage.get("twiller-storage-notice-v1"), "acknowledged");
  } finally { previous ? Object.defineProperty(globalThis, "localStorage", previous) : delete globalThis.localStorage; }
});
test("password visibility toggle preserves the field value and reports its state", () => {
  const h = hooks();
  const controls = { Button: "button", Card: "div", CardContent: "div", CardHeader: "div", CardTitle: "h2", Label: "label", Input: "input", Separator: "hr" };
  const { default: Modal } = compile("components/Authmodel.tsx", {
    react: h.react, "react/jsx-runtime": jsx, "@/context/AuthContext": { useAuth: () => ({ login: async () => {}, signup: async () => {}, googlesignin: async () => false, isLoading: false, otpPendingEmail: "", verifyOtp: async () => {}, cancelOtp: async () => {}, authError: "", retrySession: async () => {} }) },
    "next/navigation": { useRouter: () => ({ push() {} }) }, "lucide-react": Object.fromEntries(["X", "Mail", "Lock", "User", "Eye", "EyeOff"].map(icon => [icon, "svg"])),
    "./Twitterlogo": { default: "svg", __esModule: true }, "./loading-spinner": { default: "span", __esModule: true },
    "./ui/button": { Button: controls.Button }, "./ui/card": { Card: controls.Card, CardContent: controls.CardContent, CardHeader: controls.CardHeader, CardTitle: controls.CardTitle }, "./ui/label": { Label: controls.Label }, "./ui/input": { Input: controls.Input }, "./ui/separator": { Separator: controls.Separator },
  });
  const render = () => { h.reset(); return Modal({ isOpen: true, onClose() {}, initialMode: "login" }); };
  let tree = render();
  let password = findElement(tree, node => node.type === "input" && node.props.id === "password");
  assert.equal(password.props.type, "password");
  password.props.onChange({ target: { value: "test-password" } });
  tree = render();
  const show = findElement(tree, node => node.type === "button" && node.props["aria-label"] === "Show password");
  assert.ok(show); show.props.onClick();
  tree = render();
  password = findElement(tree, node => node.type === "input" && node.props.id === "password");
  assert.equal(password.props.type, "text"); assert.equal(password.props.value, "test-password");
  assert.equal(findElement(tree, node => node.type === "button" && node.props["aria-label"] === "Hide password").props["aria-pressed"], true);
});
test("mobile More menu exposes missing destinations and account logout without copying the desktop sidebar", async () => {
  const h = hooks(); const destinations = []; let logoutCalls = 0;
  const iconNames = ["Bookmark", "Crown", "LogOut", "Mail", "MoreHorizontal", "Settings", "User", "X"];
  const { default: MoreMenu } = compile("components/layout/MobileMoreMenu.tsx", {
    react: h.react, "react/jsx-runtime": jsx, "lucide-react": Object.fromEntries(iconNames.map(icon => [icon, icon])),
    "../ConfirmLogoutDialog": "ConfirmLogoutDialog",
    "@/context/AuthContext": { useAuth: () => ({ user: { username: "local", displayName: "Local user" }, logout: async () => { logoutCalls++; } }) },
  });
  const render = () => { h.reset(); return MoreMenu({ currentPage: "settings", onNavigate: page => destinations.push(page) }); };
  let tree = render();
  findElement(tree, node => node.props?.["aria-label"] === "More navigation").props.onClick();
  tree = render();
  const mobileDialog = findElement(tree, node => node.type === "AccessibleDialog");
  assert.equal(mobileDialog?.props.open, true); assert.equal(mobileDialog?.props.labelledBy, "mobile-more-title");
  const settings = findElement(tree, node => node.type === "button" && elementText(node) === "Settings");
  assert.equal(settings.props["aria-current"], "page"); settings.props.onClick();
  assert.deepEqual(destinations, ["settings"]);
  tree = render(); findElement(tree, node => node.props?.["aria-label"] === "More navigation").props.onClick(); tree = render();
  findElement(tree, node => node.type === "button" && elementText(node) === "Log out").props.onClick();
  tree = render(); const confirm = findElement(tree, node => node.type === "ConfirmLogoutDialog");
  assert.ok(confirm); confirm.props.onConfirm(); await Promise.resolve(); assert.equal(logoutCalls, 1);
});
test("shortcuts ignore typing targets and open search, composer, and help only for their intended keys", async () => {
  const h = hooks(); let handler; let composerCalls = 0; const navigations = []; let focusCalls = 0;
  const saved = Object.fromEntries(["window", "document", "HTMLElement"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  class TestElement { constructor(typing = false) { this.isContentEditable = false; this.typing = typing; } closest() { return this.typing ? {} : null; } }
  const search = { getClientRects: () => [1], focus: () => focusCalls++ };
  globalThis.HTMLElement = TestElement;
  globalThis.document = { querySelector: () => search };
  globalThis.window = { addEventListener(_name, callback) { handler = callback; }, removeEventListener() {}, setTimeout(callback) { callback(); } };
  try {
    const { default: Shortcuts } = compile("components/KeyboardShortcuts.tsx", { react: h.react, "react/jsx-runtime": jsx });
    const render = () => { h.reset(); return Shortcuts({ canCompose: true, onNavigate: page => navigations.push(page), onOpenComposer: () => composerCalls++ }); };
    render(); h.effects[0]();
    const event = (key, target = new TestElement()) => handler({ key, target, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() {} });
    event("n"); assert.equal(composerCalls, 1);
    event("n", new TestElement(true)); assert.equal(composerCalls, 1);
    event("/"); assert.equal(focusCalls, 1); assert.deepEqual(navigations, []);
    event("?"); const tree = render(); assert.ok(findElement(tree, node => node.type === "AccessibleDialog" && node.props.open));
  } finally { for (const [key, descriptor] of Object.entries(saved)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; }
});
test("Back to Top appears only on long scrolled pages and uses reduced-motion-safe scrolling", async () => {
  const h = hooks(); let scrollHandler; let scrollCall; let frameId = 0;
  const saved = Object.fromEntries(["window", "document", "requestAnimationFrame", "cancelAnimationFrame"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const root = { scrollHeight: 1400 };
  globalThis.document = { documentElement: root };
  globalThis.window = { innerHeight: 600, scrollY: 500, addEventListener(name, handler) { if (name === "scroll") scrollHandler = handler; }, removeEventListener() {}, matchMedia: () => ({ matches: true }), scrollTo: args => { scrollCall = args; } };
  globalThis.requestAnimationFrame = callback => { callback(); return ++frameId; };
  globalThis.cancelAnimationFrame = () => {};
  try {
    const { default: BackToTop } = compile("components/BackToTop.tsx", { react: h.react, "react/jsx-runtime": jsx, "lucide-react": { ArrowUp: "svg" } });
    const render = () => { h.reset(); return BackToTop(); };
    render(); h.effects[0](); let tree = render();
    const button = findElement(tree, node => node.type === "button" && node.props["aria-label"] === "Back to top");
    assert.ok(button); button.props.onClick(); assert.deepEqual(scrollCall, { top: 0, behavior: "auto" });
    root.scrollHeight = 700; scrollHandler(); assert.equal(render(), null);
  } finally { for (const [key, descriptor] of Object.entries(saved)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; }
});
test("legal reading progress reports the current position without a React render loop", async () => {
  const h = hooks(); let scrollHandler; const saved = Object.fromEntries(["window", "document", "requestAnimationFrame", "cancelAnimationFrame"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let progress = 0; const bar = { style: {}, setAttribute(name, value) { if (name === "aria-valuenow") progress = Number(value); } };
  globalThis.document = { documentElement: { scrollHeight: 1200 } };
  globalThis.window = { innerHeight: 600, scrollY: 300, addEventListener(name, handler) { if (name === "scroll") scrollHandler = handler; }, removeEventListener() {} };
  globalThis.requestAnimationFrame = callback => { callback(); return 1; }; globalThis.cancelAnimationFrame = () => {};
  try {
    const { default: ScrollProgress } = compile("components/ScrollProgress.tsx", { react: h.react, "react/jsx-runtime": jsx });
    h.reset(); const tree = ScrollProgress(); tree.props.ref.current = bar; h.effects[0]();
    assert.equal(progress, 50); assert.equal(bar.style.transform, "scaleX(0.5)");
    globalThis.window.scrollY = 600; scrollHandler(); assert.equal(progress, 100);
  } finally { for (const [key, descriptor] of Object.entries(saved)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; }
});
test("shared skeletons keep loading distinct from empty and error states", () => {
  const { PostSkeleton, RowSkeleton } = compile("components/ui/Skeletons.tsx", { react: hooks().react, "react/jsx-runtime": jsx });
  const posts = PostSkeleton({ count: 2 }); const rows = RowSkeleton({ count: 2 });
  assert.equal(posts.props.role, "status"); assert.equal(posts.props["aria-label"], "Loading posts");
  assert.equal(rows.props.role, "status"); assert.equal(rows.props["aria-label"], "Loading items");
  assert.doesNotMatch(elementText(posts), /Retry|No posts/);
});
test("Settings FAQ uses native disclosure semantics and only supported product behavior", () => {
  const h = hooks(); const iconNames = ["User", "Bell", "Shield", "LogOut", "ChevronRight", "Eye", "Lock", "CreditCard"];
  const { default: SettingsPage } = compile("components/SettingsPage.tsx", {
    react: h.react, "react/jsx-runtime": jsx, "lucide-react": Object.fromEntries(iconNames.map(icon => [icon, icon])),
    "next/link": "a", "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: null, logout: async () => {} }) },
    "@/context/ThemeContext": { useTheme: () => ({ preference: "system", setPreference() {} }) },
    "./ConfirmLogoutDialog": "ConfirmLogoutDialog", "./ui/avatar": { Avatar: "div", AvatarFallback: "span", AvatarImage: "img" },
  });
  h.reset(); const tree = SettingsPage({});
  const details = []; (function collect(node) { if (Array.isArray(node)) return node.forEach(collect); if (!node || typeof node !== "object") return; if (node.type === "details") details.push(node); collect(node.props?.children); })(tree);
  assert.equal(details.length, 4);
  assert.ok(details.every(item => findElement(item, child => child.type === "summary")));
  assert.doesNotMatch(elementText(tree), /analytics|account deletion|priority support/i);
});
test("TW-020: notification load-more retry repeats the failed cursor and preserves loaded items", async () => {
  const h = hooks(); const calls = []; let failNextPage = false;
  const iconNames = ["Bell", "Heart", "MessageCircle", "Repeat2", "UserPlus"];
  const icons = Object.fromEntries(iconNames.map(name => [name, name]));
  const first = { _id: "first", type: "follow", actor: { _id: "a1", username: "a", displayName: "A" }, readAt: null, createdAt: new Date().toISOString() };
  const second = { _id: "second", type: "follow", actor: { _id: "a2", username: "b", displayName: "B" }, readAt: null, createdAt: new Date().toISOString() };
  const axios = { get: async (_url, options) => {
    calls.push(options.params);
    if (options.params.cursor && failNextPage) { failNextPage = false; throw new Error("offline"); }
    return { data: options.params.cursor ? { items: [second], nextCursor: null, hasMore: false, unreadCount: 2 } : { items: [first], nextCursor: "cursor-2", hasMore: true, unreadCount: 2 } };
  } };
  const { default: NotificationsPage } = compile("components/NotificationsPage.tsx", {
    react: h.react, "react/jsx-runtime": jsx, "lucide-react": icons,
    "@/lib/axiosInstance": { default: axios, __esModule: true },
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "recipient" } }) },
    "./ui/avatar": { Avatar: "Avatar", AvatarFallback: "AvatarFallback", AvatarImage: "AvatarImage" },
  });
  const render = () => { h.reset(); return NotificationsPage({}); };
  let tree = render();
  await h.effects[0]();
  tree = render();
  failNextPage = true;
  const loadMore = findElement(tree, node => node.type === "button" && elementText(node) === "Load more");
  await loadMore.props.onClick();
  tree = render();
  assert.ok(findElement(tree, node => node.props?.role === "alert"), "load-more failure is surfaced");
  assert.ok(findElement(tree, node => node.type === "button" && elementText(node) === "Retry"));
  assert.ok(findElement(tree, node => node.type === "button" && elementText(node).includes("A")), "existing notification remains rendered");
  const retry = findElement(tree, node => node.type === "button" && elementText(node) === "Retry");
  await retry.props.onClick();
  tree = render();
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(params => params.cursor || null), [null, "cursor-2", "cursor-2"]);
  assert.ok(findElement(tree, node => node.type === "button" && elementText(node).includes("B")), "retry appends the next page");
  assert.equal(findElement(tree, node => node.props?.role === "alert"), undefined, "error clears after retry succeeds");
});
test("TW-007: pending verification never loads/publishes a profile; failures propagate", async () => {
  const { completeSession } = compile("lib/auth-session.ts", {}); let reads = 0;
  assert.deepEqual(await completeSession(async () => ({ requiresOtp: true }), async () => { reads++; }), { status: "pending" }); assert.equal(reads, 0);
  await assert.rejects(completeSession(async () => { throw new Error("invalid OTP"); }, async () => { reads++; }), /invalid OTP/); assert.equal(reads, 0);
  assert.equal((await completeSession(async () => ({ requiresOtp: false }), async () => ({ _id: "one" }))).user._id, "one");
});
test("TW-007: a deferred profile response cannot republish after logout", async () => {
  const { AuthGeneration } = compile("lib/auth-session.ts", {}); const generation = new AuthGeneration(); const g = generation.next(); const pending = deferred(); let user = null;
  const work = generation.publish(g, () => pending.promise, value => { user = value; });
  generation.next(); pending.resolve({ _id: "old" }); await work; assert.equal(user, null);
});
test("local demo is explicit, persists only its local session, and never calls Firebase", async () => {
  const h = hooks(); let active = false;
  const sample = { _id: "000000000000000000000001", username: "localdemo", displayName: "Local Demo", email: "demo@example.invalid", avatar: "", plan: "free", tweetCount: 0, followers: [], following: [], bookmarks: [] };
  const firebase = { onAuthStateChanged() { throw new Error("Firebase must not be called in demo mode"); }, signOut() { throw new Error("Firebase must not be called in demo mode"); } };
  const localDemo = { localDemoEnabled: true, demoSessionActive: () => active, demoUser: () => sample, setDemoSession: value => { active = value; }, updateDemoUser: fields => ({ ...sample, ...fields }) };
  const { AuthProvider } = compile("context/AuthContext.tsx", { react: h.react, "react/jsx-runtime": jsx, "firebase/auth": firebase, "./firebase": { auth: {} }, "../lib/axiosInstance": { default: {}, __esModule: true }, "../lib/auth-session": compile("lib/auth-session.ts", {}), "../lib/local-demo": localDemo, axios: { isAxiosError: () => false } });
  const render = () => { h.reset(); return AuthProvider({ children: null }).props.value; };
  let context = render(); h.effects.forEach(effect => effect()); context = render();
  assert.equal(context.isDemoMode, true); assert.equal(context.status, "anonymous");
  assert.equal(await context.startDemoSession(), true); context = render();
  assert.equal(active, true); assert.equal(context.status, "authenticated"); assert.equal(context.user._id, sample._id);
  await assert.rejects(context.login("demo@example.invalid", "password"), /not connected in demo mode/);
  await assert.rejects(context.googlesignin(), /unavailable in local demo mode/);
  await context.logout(); context = render();
  assert.equal(active, false); assert.equal(context.user, null); assert.equal(context.status, "anonymous");
});
test("local Auth Emulator uses the Firebase SDK once and cannot be enabled in production", () => {
  const names = ["NODE_ENV", "NEXT_PUBLIC_TWILLER_LOCAL_AUTH_EMULATOR", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL", "NEXT_PUBLIC_TWILLER_DEPLOYMENT_STAGE", "NEXT_PUBLIC_VERCEL_ENV"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const previousWindow = globalThis.window;
  const app = {}; const auth = {}; let initialized = 0; let config; const connections = [];
  const firebaseApp = { getApps: () => initialized ? [app] : [], getApp: () => app, initializeApp: value => { initialized++; config = value; return app; } };
  const firebaseAuth = { getAuth: () => auth, connectAuthEmulator: (actualAuth, url, options) => connections.push({ actualAuth, url, options }) };
  const overrides = { "firebase/app": firebaseApp, "firebase/auth": firebaseAuth, "@/lib/firebase-config": compile("lib/firebase-config.ts", {}) };
  try {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_TWILLER_LOCAL_AUTH_EMULATOR = "true";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-twiller-local";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL = "http://127.0.0.1:9099";
    delete process.env.NEXT_PUBLIC_TWILLER_DEPLOYMENT_STAGE;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    globalThis.window = {};
    compile("context/firebase.tsx", overrides);
    compile("context/firebase.tsx", overrides); // Simulate a Fast Refresh module reload.
    assert.equal(initialized, 1);
    assert.equal(config.projectId, "demo-twiller-local");
    assert.deepEqual(connections, [{ actualAuth: auth, url: "http://127.0.0.1:9099", options: { disableWarnings: true } }]);

    process.env.NODE_ENV = "production";
    assert.throws(() => compile("context/firebase.tsx", overrides), /cannot be enabled in a production build/);
  } finally {
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    globalThis.window = previousWindow;
  }
});
test("TW-029: avatar previews locally before publication and adopts the canonical server URL after save", async () => {
  const h = hooks(); let closed = 0; let saved;
  const user = { _id: "111111111111111111111111", username: "one", displayName: "One", avatar: "", bio: "", location: "", website: "", notificationsEnabled: false };
  const oldDocument = globalThis.document; const oldCreate = URL.createObjectURL; const oldRevoke = URL.revokeObjectURL;
  globalThis.document = { cookie: "" };
  URL.createObjectURL = () => "blob:local-avatar-preview";
  URL.revokeObjectURL = () => {};
  const controls = { Card: "div", CardContent: "div", CardHeader: "header", CardTitle: "h2", Button: "button", Avatar: "div", AvatarFallback: "span", AvatarImage: "img", Label: "label", Input: "input", Textarea: "textarea" };
  const icons = Object.fromEntries(["Camera", "LinkIcon", "MapPin", "X"].map(key => [key, "svg"]));
  const overrides = {
    react: h.react,
    "react/jsx-runtime": jsx,
    "@/context/AuthContext": { useAuth: () => ({ user, updateProfile: async data => { saved = data; return { ...user, ...data }; } }) },
    "./ui/card": { ...controls }, "./ui/button": { Button: "button" }, "./ui/avatar": { Avatar: "div", AvatarFallback: "span", AvatarImage: "img" },
    "./ui/label": { Label: "label" }, "./ui/input": { Input: "input" }, "./ui/textarea": { Textarea: "textarea" },
    "./loading-spinner": { default: "span", __esModule: true }, "lucide-react": icons,
    "@/lib/axiosInstance": { default: {}, __esModule: true },
    "@/lib/media": { uploadMedia: async () => ({ id: "media-one", url: "http://127.0.0.1:5055/media/media-one" }), mediaErrorMessage: () => "Upload failed" },
  };
  try {
    const { default: EditProfile } = compile("components/Editprofile.tsx", overrides);
    const render = () => { h.reset(); return EditProfile({ isopen: true, onclose: () => { closed++; } }); };
    let tree = render(); h.effects.forEach(effect => effect()); tree = render();
    const file = { name: "avatar.png", size: 10, type: "image/png" };
    await elements(tree).find(node => node.props?.id === "avatarUpload").props.onChange({ target: { files: [file] } });
    tree = render();
    assert.equal(elements(tree).find(node => node.type === "img" && node.props?.src === "blob:local-avatar-preview")?.props.alt, "", "adjacent profile text names the avatar, so it stays decorative");
    const form = elements(tree).find(node => node.type === "form" && node.props.id === "edit-profile-form");
    await form.props.onSubmit({ preventDefault() {} });
    tree = render();
    assert.equal(saved.avatar, "http://127.0.0.1:5055/media/media-one");
    assert.equal(elements(tree).find(node => node.type === "img" && node.props?.src === "http://127.0.0.1:5055/media/media-one")?.props.alt, "");
    assert.equal(closed, 1);
  } finally {
    globalThis.document = oldDocument;
    if (oldCreate === undefined) delete URL.createObjectURL; else URL.createObjectURL = oldCreate;
    if (oldRevoke === undefined) delete URL.revokeObjectURL; else URL.revokeObjectURL = oldRevoke;
  }
});
test("TW-029: backend media avatar sources use CORS while external photo behavior is preserved", () => {
  const { AvatarImage } = compile("components/ui/avatar.tsx", {
    "@radix-ui/react-avatar": { Root: "span", Image: "img", Fallback: "span" },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
  });
  const mediaUrl = "http://127.0.0.1:5055/media/6ac3bf67b3be65425bd747e4";
  const media = AvatarImage({ src: mediaUrl, alt: "User avatar" });
  assert.equal(media.props.src, mediaUrl);
  assert.equal(media.props.crossOrigin, "anonymous");

  const firebasePhoto = AvatarImage({ src: "https://lh3.googleusercontent.com/user-photo", alt: "User avatar" });
  assert.equal(firebasePhoto.props.src, "https://lh3.googleusercontent.com/user-photo");
  assert.equal(firebasePhoto.props.crossOrigin, undefined);
  const explicitPolicy = AvatarImage({ src: mediaUrl, crossOrigin: "use-credentials", alt: "User avatar" });
  assert.equal(explicitPolicy.props.crossOrigin, "use-credentials");
});
test("TW-022/TW-023/TW-031/TW-058/TW-060: visible controls and product copy stay within implemented behavior", () => {
  const read = path => readFileSync(new URL(`../../twiller/src/${path}`, import.meta.url), "utf8");
  const editor = read("components/Editprofile.tsx");
  assert.match(editor, /interface is currently available in English only/);
  assert.doesNotMatch(editor, /googtrans|request-language-change|verify-language-change|Notification\.requestPermission/);
  assert.match(editor, /Browser push and keyword alerts are not available/);

  const plans = read("components/SubscriptionPage.tsx");
  assert.match(plans, /posts or replies per 30-day period/);
  assert.match(plans, /Plan expires:/);
  assert.match(plans, /do not renew automatically/);
  for (const unsupported of ["Priority feed ranking", "Email support", "Verified badge", "Analytics dashboard", "Plan renews:", "An invoice will be emailed to you immediately"]) {
    assert.equal(plans.includes(unsupported), false, `unsupported subscription claim remains: ${unsupported}`);
  }

  const repost = read("components/TweetCard.tsx");
  assert.match(repost, /not distributed to followers/);
  const privacy = read("app/privacy/page.tsx");
  const cookies = read("app/cookies/page.tsx");
  assert.doesNotMatch(privacy, /request account deletion at any time through Settings/);
  assert.match(privacy, /does not send uploaded images to ImgBB/);
  assert.doesNotMatch(cookies, /cache your user profile data|ImgBB/);
});
test("local demo API keeps feed/profile interactions browser-local and returns public user fields", async () => {
  const previousMode = process.env.NEXT_PUBLIC_LOCAL_DEMO; const previousNodeEnv = process.env.NODE_ENV;
  const previousWindow = globalThis.window; const storage = new Map();
  process.env.NEXT_PUBLIC_LOCAL_DEMO = "true"; process.env.NODE_ENV = "development";
  globalThis.window = { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  try {
    const demo = compile("lib/local-demo.js", {});
    assert.equal(demo.localDemoEnabled, true);
    const feed = await demo.demoAdapter({ url: "/feed", method: "get", params: {} });
    assert.equal(feed.data.tweets.length, 2);
    assert.equal(feed.data.tweets[0].author.email, undefined);
    const created = await demo.demoAdapter({ url: "/post", method: "post", data: JSON.stringify({ content: "A local sample post" }) });
    assert.equal(created.data.content, "A local sample post");
    await demo.demoAdapter({ url: "/bookmarks/000000000000000000000101", method: "put" });
    const bookmarks = await demo.demoAdapter({ url: "/bookmarks/000000000000000000000001", method: "get" });
    assert.equal(bookmarks.data.length, 1);
    assert.equal(demo.demoUser().email, "demo@example.invalid");
    await assert.rejects(demo.demoAdapter({ url: "/unsupported-demo-action", method: "post" }), error => error.response.status === 501);
  } finally {
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_LOCAL_DEMO; else process.env.NEXT_PUBLIC_LOCAL_DEMO = previousMode;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    globalThis.window = previousWindow;
  }
});
test("TW-006/007: actual AuthProvider handles failed registration retry, pending refresh, invalid OTP, and logout during fetch", async () => {
  const h = hooks(); let listener; let current = null; let failRegister = true; let fetchDeferred; let posts = [];
  const profile = { _id: "111111111111111111111111", username: "one", displayName: "One", email: "one@example.test", avatar: "", plan: "free", followers: [], following: [], bookmarks: [] };
  const auth = { get currentUser() { return current; } };
  let requiresOtp = true;
  const firebase = {
    onAuthStateChanged: (_auth, callback) => { listener = callback; callback(current); return () => {}; },
    getRedirectResult: async () => null,
    createUserWithEmailAndPassword: async () => { current = { uid: "one", email: profile.email, getIdToken: async () => "firebase-id-token" }; listener(current); return { user: current }; },
    signInWithEmailAndPassword: async () => ({ user: current }),
    signOut: async () => { current = null; listener(null); },
    sendEmailVerification: async () => {}, GoogleAuthProvider: class {},
  };
  const api = {
    post: async (path, input) => { posts.push({ path, input }); if (path === "/register" && failRegister) throw new Error("registration failed"); if (path === "/verify-login-otp") { if (input.otp !== "123456") throw new Error("invalid OTP"); requiresOtp = false; } return { data: { requiresOtp } }; },
    get: async () => { if (fetchDeferred) return fetchDeferred.promise; return { data: profile }; },
  };
  const originalWindow = globalThis.window; const originalStorage = globalThis.localStorage;
  globalThis.window = { addEventListener() {}, removeEventListener() {} }; globalThis.localStorage = { removeItem() {} };
  try {
    const { AuthProvider } = compile("context/AuthContext.tsx", { react: h.react, "react/jsx-runtime": jsx, "firebase/auth": firebase, "./firebase": { auth }, "../lib/axiosInstance": { default: api, __esModule: true }, "../lib/auth-session": compile("lib/auth-session.ts", {}), "../lib/local-demo": { localDemoEnabled: false, demoSessionActive: () => false, demoUser: () => null, setDemoSession() {}, updateDemoUser() {} }, axios: { isAxiosError: () => false } });
    const render = () => { h.reset(); return AuthProvider({ children: null }).props.value; };
    let context = render(); h.effects.forEach(effect => effect());
    await assert.rejects(context.signup(profile.email, "password", "one", "One"), /registration failed/);
    context = render(); assert.equal(context.user, null); assert.equal(context.isLoading, false);
    failRegister = false;
    assert.equal(await context.signup(profile.email, "password", "one", "One"), false);
    context = render(); assert.equal(context.status, "pending"); assert.equal(context.user, null);
    await context.retrySession(); context = render(); assert.equal(context.status, "pending");
    await assert.rejects(context.verifyOtp("000000"), /invalid OTP/); context = render(); assert.equal(context.status, "pending"); assert.match(context.authError, /invalid OTP/);
    await context.verifyOtp("123456"); context = render(); assert.equal(context.user._id, profile._id);
    fetchDeferred = deferred(); const refresh = context.refreshUser(); await context.logout();
    fetchDeferred.resolve({ data: profile }); await refresh;
    context = render(); assert.equal(context.user, null); assert.equal(context.status, "anonymous");
    const registration = posts.filter(value => value.path === "/register").at(-1).input;
    assert.deepEqual(Object.keys(registration).sort(), ["avatar", "displayName", "username"]);
  } finally { globalThis.window = originalWindow; globalThis.localStorage = originalStorage; }
});
function authProviderHarness({ redirectResult = Promise.resolve(null), initialUser = null, api = {}, autoStart = true, emitInitialAuth = true } = {}) {
  const h = hooks();
  let listener;
  let current = null;
  let redirectCalls = 0;
  const auth = { get currentUser() { return current; }, signOut: async () => { current = null; listener?.(null); } };
  const firebase = {
    onAuthStateChanged: (_auth, callback) => { listener = callback; if (emitInitialAuth) queueMicrotask(() => { current = initialUser; callback(initialUser); }); return () => {}; },
    getRedirectResult: () => { redirectCalls++; return redirectResult; },
    signInWithRedirect: async () => {},
    signOut: async () => { current = null; listener?.(null); },
    GoogleAuthProvider: class {},
    browserPopupRedirectResolver: {},
  };
  const requests = [];
  const apiClient = {
    post: async (path, input, config) => { requests.push({ method: "post", path, input, config }); return { data: { requiresOtp: false } }; },
    get: async path => { requests.push({ method: "get", path }); return { data: { _id: "profile-one", username: "googleuser", email: "google@example.test" } }; },
    ...api,
  };
  const { AuthProvider } = compile("context/AuthContext.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "firebase/auth": firebase,
    "./firebase": { auth },
    "../lib/axiosInstance": { default: apiClient, __esModule: true },
    "../lib/auth-session": compile("lib/auth-session.ts", {}),
    "../lib/local-demo": { localDemoEnabled: false, demoSessionActive: () => false, demoUser: () => null, setDemoSession() {}, updateDemoUser() {} },
    axios: { isAxiosError: error => error?.isAxiosError === true },
  });
  const render = () => { h.reset(); return AuthProvider({ children: null }).props.value; };
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.localStorage = { removeItem() {} };
  const context = render();
  let started = false;
  let cleanup;
  const start = () => { if (!started) { started = true; h.effects.forEach(effect => { cleanup = effect(); }); } };
  const replayInitializationEffect = () => { cleanup?.(); cleanup = undefined; started = false; start(); };
  if (autoStart) start();
  let latest = context;
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); latest = render(); return latest; };
  return {
    requests,
    get redirectCalls() { return redirectCalls; },
    emitAuthState(user) { current = user; listener?.(user); },
    get context() { return latest; },
    start,
    replayInitializationEffect,
    flush,
    restoreGlobals() { globalThis.window = originalWindow; globalThis.localStorage = originalStorage; },
  };
}
const googleRedirectUser = () => ({ uid: "google-uid", email: "google@example.test", displayName: "Google User", providerData: [{ providerId: "google.com" }], getIdToken: async () => "emulator-id-token" });
test("Firebase Google redirect result authenticates through one backend session and profile read", async () => {
  const user = googleRedirectUser();
  const harness = authProviderHarness({ redirectResult: Promise.resolve({ user }), initialUser: user });
  try {
    await harness.flush();
    await harness.flush();
    assert.equal(harness.context.status, "authenticated");
    assert.equal(harness.context.user._id, "profile-one");
    assert.equal(harness.context.isLoading, false);
    assert.equal(harness.redirectCalls, 1);
    assert.deepEqual(harness.requests.map(request => request.path), ["/log-session", "/loggedinuser"]);
    assert.equal(harness.requests.filter(request => request.path === "/register").length, 0);
    assert.equal(harness.requests[0].config.headers.Authorization, "Bearer emulator-id-token");
  } finally { harness.restoreGlobals(); }
});
test("React Strict Mode effect replay consumes one Firebase redirect result", async () => {
  const user = googleRedirectUser();
  const harness = authProviderHarness({ redirectResult: Promise.resolve({ user }), initialUser: user });
  try {
    harness.replayInitializationEffect();
    await harness.flush();
    await harness.flush();
    assert.equal(harness.redirectCalls, 1);
    assert.equal(harness.requests.filter(request => request.path === "/log-session").length, 1);
    assert.equal(harness.context.status, "authenticated");
  } finally { harness.restoreGlobals(); }
});
test("Firebase initialization with no redirect settles anonymous and keeps the auth-state listener active", async () => {
  const harness = authProviderHarness({ redirectResult: Promise.resolve(null), initialUser: null });
  try {
    await harness.flush();
    assert.equal(harness.context.status, "anonymous");
    assert.equal(harness.context.isLoading, false);
    assert.deepEqual(harness.requests, []);
    assert.equal(harness.redirectCalls, 1);
    harness.emitAuthState(googleRedirectUser());
    await harness.flush();
    await harness.flush();
    assert.equal(harness.context.status, "authenticated");
    assert.equal(harness.requests.filter(request => request.path === "/log-session").length, 1);
  } finally { harness.restoreGlobals(); }
});
test("Firebase redirect failure settles with a recoverable message instead of exposing SDK details", async () => {
  const failure = Object.assign(new Error("private provider detail"), { code: "auth/operation-not-allowed" });
  const harness = authProviderHarness({ redirectResult: Promise.reject(failure), initialUser: null });
  try {
    await harness.flush();
    assert.equal(harness.context.status, "denied");
    assert.equal(harness.context.isLoading, false);
    assert.equal(harness.context.authError, "Google sign-in is not enabled for this Firebase project.");
    assert.doesNotMatch(harness.context.authError, /private provider detail|auth\/operation-not-allowed/);
    assert.deepEqual(harness.requests, []);
  } finally { harness.restoreGlobals(); }
});
test("auth-state notification during a redirect waits for the redirect result and loads once", async () => {
  const pendingRedirect = deferred();
  const user = googleRedirectUser();
  const harness = authProviderHarness({ redirectResult: pendingRedirect.promise, initialUser: user });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(harness.requests, []);
    pendingRedirect.resolve({ user });
    await harness.flush();
    await harness.flush();
    assert.equal(harness.context.status, "authenticated");
    assert.equal(harness.requests.filter(request => request.path === "/log-session").length, 1);
    assert.equal(harness.requests.filter(request => request.path === "/loggedinuser").length, 1);
  } finally { harness.restoreGlobals(); }
});
test("a Google redirect profile-required retry registers once and creates one session", async () => {
  const user = googleRedirectUser();
  let sessionAttempts = 0;
  let registrations = 0;
  const harness = authProviderHarness({
    redirectResult: Promise.resolve({ user }),
    initialUser: user,
    api: {
      post: async (path, input, config) => {
        if (path === "/log-session" && ++sessionAttempts === 1) throw { isAxiosError: true, response: { data: { code: "PROFILE_REQUIRED", error: "Complete account registration" } } };
        if (path === "/register") registrations++;
        return { data: { requiresOtp: false } };
      },
    },
  });
  try {
    await harness.flush();
    await harness.flush();
    assert.equal(harness.context.status, "authenticated");
    assert.equal(registrations, 1);
    assert.equal(sessionAttempts, 2);
    assert.equal(harness.requests.filter(request => request.path === "/loggedinuser").length, 1);
  } finally { harness.restoreGlobals(); }
});
test("a stalled Firebase redirect lookup settles startup with a retryable error", async () => {
  const pendingRedirect = deferred();
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let watchdog;
  globalThis.setTimeout = callback => { watchdog = callback; return 123; };
  globalThis.clearTimeout = () => {};
  const harness = authProviderHarness({ redirectResult: pendingRedirect.promise, initialUser: null, autoStart: false, emitInitialAuth: false });
  try {
    harness.start();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof watchdog, "function");
    watchdog();
    await harness.flush();
    assert.equal(harness.context.status, "denied");
    assert.equal(harness.context.isLoading, false);
    assert.match(harness.context.authError, /check your connection and try again/i);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    harness.restoreGlobals();
  }
});
test("a late Google redirect result does not create a second backend session", async () => {
  const pendingRedirect = deferred();
  const user = googleRedirectUser();
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let watchdog;
  globalThis.setTimeout = callback => { watchdog = callback; return 123; };
  globalThis.clearTimeout = () => {};
  const harness = authProviderHarness({ redirectResult: pendingRedirect.promise, initialUser: user, autoStart: false });
  try {
    harness.start();
    await new Promise(resolve => setImmediate(resolve));
    watchdog();
    await harness.flush();
    await harness.flush();
    pendingRedirect.resolve({ user });
    await harness.flush();
    assert.equal(harness.context.status, "authenticated");
    assert.equal(harness.requests.filter(request => request.path === "/log-session").length, 1);
    assert.equal(harness.requests.filter(request => request.path === "/register").length, 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    harness.restoreGlobals();
  }
});
function elements(element) {
  if (!element || typeof element !== "object") return [];
  const children = element.props?.children;
  return [element, ...[].concat(children || []).flatMap(elements)];
}
test("TW-007: actual auth modal stays open while OTP is pending and announces invalid codes", async () => {
  const h = hooks(); let closed = 0; let invalid = true;
  const authContext = { otpPendingEmail: "one@example.test", isLoading: false, authError: "", verifyOtp: async () => { if (invalid) throw new Error("Invalid login code"); }, cancelOtp: async () => {}, retrySession: async () => {} };
  const controls = { Button: "button", Card: "div", CardContent: "div", CardHeader: "div", CardTitle: "h2", Label: "label", Input: "input", Separator: "hr" };
  const overrides = { react: h.react, "react/jsx-runtime": jsx, "@/context/AuthContext": { useAuth: () => authContext }, "next/navigation": { useRouter: () => ({ push() {} }) }, "lucide-react": Object.fromEntries(["X", "Mail", "Lock", "User", "Eye", "EyeOff"].map(key => [key, "svg"])), "./Twitterlogo": { default: "svg", __esModule: true }, "./loading-spinner": { default: "span", __esModule: true } };
  for (const path of ["button", "card", "label", "input", "separator"]) overrides[`./ui/${path}`] = controls;
  const { default: Modal } = compile("components/Authmodel.tsx", overrides);
  const render = () => { h.reset(); return Modal({ isOpen: false, onClose: () => { closed++; } }); };
  let nodes = elements(render()); assert.ok(nodes.find(node => node.props?.id === "login-otp"));
  await nodes.find(node => node.type === "button" && node.props.children === "Verify OTP").props.onClick();
  assert.equal(closed, 0); nodes = elements(render()); assert.ok(nodes.find(node => node.props?.role === "alert" && node.props.children === "Invalid login code"));
  invalid = false; await nodes.find(node => node.type === "button" && node.props.children === "Verify OTP").props.onClick(); assert.equal(closed, 1);
});
test("TW-027: quota-rejected reply shows a safe inline error and preserves the draft and counts", async () => {
  const post = { _id: "222222222222222222222222", content: "A test post", author: { _id: "111111111111111111111111", displayName: "One", avatar: "" }, likes: 0, retweets: 0, comments: 0 };
  const user = { _id: "111111111111111111111111", displayName: "One", avatar: "" };
  const state = [post, [], false, false, "A reply draft", false, ""];
  let stateIndex = 0;
  let posted = 0;
  const react = {
    useState(initial) {
      const index = stateIndex++;
      if (state[index] === undefined) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useEffect() {},
  };
  const overrides = {
    react,
    "react/jsx-runtime": jsx,
    "next/navigation": { useParams: () => ({ id: post._id }) },
    "@/context/AuthContext": { useAuth: () => ({ user }) },
    "@/lib/axiosInstance": { default: { post: async () => { posted++; throw { response: { status: 403, data: { code: "QUOTA_EXHAUSTED", error: "Posting allowance reached for this period" } } }; } }, __esModule: true },
    "@/components/TweetCard": { default: "article", __esModule: true },
    "@/components/ui/avatar": { Avatar: "div", AvatarFallback: "span", AvatarImage: "img" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/textarea": { Textarea: "textarea" },
    "lucide-react": { ArrowLeft: "svg", MessageCircle: "svg" },
  };
  const originalError = console.error;
  let logged = false;
  console.error = () => { logged = true; };
  try {
    const { default: PostDetailPage } = compile("app/status/[id]/page.tsx", overrides);
    const render = () => { stateIndex = 0; return PostDetailPage(); };
    const tree = render();
    const form = elements(tree).find(node => node.type === "form");
    await form.props.onSubmit({ preventDefault() {} });
    const updated = elements(render());
    assert.equal(posted, 1);
    assert.equal(logged, false);
    assert.equal(updated.find(node => node.props?.role === "alert")?.props.children, "Posting allowance reached for this period");
    assert.equal(updated.find(node => node.type === "textarea")?.props.value, "A reply draft");
    assert.equal(state[0].comments, 0);
    assert.deepEqual(state[1], []);
  } finally {
    console.error = originalError;
  }
});
test("TW-017: utility controls do not submit a populated draft; Post submits exactly once", async () => {
  const h = hooks(); let submitted = 0; let created = 0;
  const initialState = h.react.useState;
  let stateCalls = 0;
  h.react.useState = initial => initialState(stateCalls++ === 0 ? "draft content" : initial);
  const controls = { Button: "button", Card: "div", CardContent: "div", Avatar: "div", AvatarFallback: "span", AvatarImage: "img", Textarea: "textarea", Separator: "hr" };
  const overrides = { react: h.react, "react/jsx-runtime": jsx, "@/context/AuthContext": { useAuth: () => ({ user: { _id: "one", username: "one", email: "one@example.test", plan: "free", tweetCount: 0 } }) }, "@/lib/axiosInstance": { default: { post: async () => { submitted++; return { data: { _id: "tweet" } }; }, get: async () => ({ data: { tweetCount: 0, planLimit: 1 } }) }, __esModule: true }, "@/lib/media": { uploadMedia: async (_file, kind) => ({ url: `http://localhost/media/${kind}` }) }, "lucide-react": Object.fromEntries(["Image", "Smile", "Calendar", "MapPin", "BarChart3", "Globe", "Crown", "Lock", "Mic"].map(key => [key, "svg"])) };
  for (const path of ["card", "avatar", "textarea", "button", "separator"]) overrides[`./ui/${path}`] = controls;
  const { default: Composer } = compile("components/TweetComposer.tsx", overrides);
  const tree = Composer({ onTweetPosted: () => { created++; } }); const nodes = elements(tree);
  const utilities = nodes.filter(node => node.type === "button" && node.props.title === "Not available"); assert.equal(utilities.length, 4);
  const form = nodes.find(node => node.type === "form"); assert.ok(form);
  for (const button of utilities) { assert.equal(button.props.type, "button"); assert.equal(button.props.disabled, true); if (!button.props.disabled && button.props.type !== "button") await form.props.onSubmit({ preventDefault() {} }); }
  assert.equal(submitted, 0);
  assert.equal(nodes.filter(node => node.type === "button" && node.props.type === "submit").length, 1);
  await form.props.onSubmit({ preventDefault() {} }); assert.equal(submitted, 1); assert.equal(created, 1);
});

// ---------------------------------------------------------------------------
// TW-025: feed shows all earlier posts, next page appears exactly once, and
//         the error banner clears after a load-more failure is retried.
// ---------------------------------------------------------------------------
test("TW-025: feed shows all earlier posts without duplicates after load-more failure and retry", async () => {
  // ── helpers ────────────────────────────────────────────────────────────────
  // Build a stable tweet object the same way the backend serialises them.
  const makeTweet = (n) => ({
    _id: String(n).padStart(24, "0"),
    content: `Post ${n}`,
    author: { _id: "aaa".padEnd(24, "0"), username: "writer", displayName: "Writer", avatar: "" },
    likes: 0, likedBy: [], retweets: 0, retweetedBy: [], replyCount: 0, parentId: null,
    timestamp: new Date(Date.now() - n * 60000).toISOString(),
  });

  // First page: posts 1–20, cursor points to page 2.
  const page1 = Array.from({ length: 20 }, (_, i) => makeTweet(i + 1));
  const page2 = Array.from({ length: 2 }, (_, i) => makeTweet(21 + i));
  const PAGE1_CURSOR = "cursor-page-2";

  // ── feed-state box ─────────────────────────────────────────────────────────
  // Feed.tsx declares useState in this order (verified against the source):
  //   0: tweets          []
  //   1: loading         false
  //   2: tab             "foryou"
  //   3: nextCursor      null
  //   4: hasMore         true
  //   5: loadingMore     false
  //   6: feedError       ""
  // useRef slots follow (requestId, loadingMoreRef) — handled via the ref mock.
  const state = [
    page1,           // 0: tweets   — first page already loaded
    false,           // 1: loading
    "foryou",        // 2: tab
    PAGE1_CURSOR,    // 3: nextCursor — cursor pointing at page 2
    true,            // 4: hasMore
    false,           // 5: loadingMore
    "",              // 6: feedError
  ];
  let stateIndex = 0;

  // Ref storage (two refs: requestId=0, loadingMoreRef=false).
  const refValues = [{ current: 1 }, { current: false }]; // requestId starts at 1 (initial load done)
  let refIndex = 0;

  let getCallCount = 0;
  let failNextGet = false;  // switch to inject a network error on the next GET

  const react = {
    // Stable state box — setter mutates in place so re-renders see new values.
    useState(initial) {
      const i = stateIndex++;
      if (!(i in state)) state[i] = initial;
      return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
    },
    // Pass-through memoisation — we want the real callbacks to execute.
    useCallback(fn) { return fn; },
    // Return pre-seeded ref objects.
    useRef(initial) {
      const i = refIndex++;
      if (!(i in refValues)) refValues[i] = { current: initial };
      return refValues[i];
    },
    // Swallow effects — the initial-load effect runs on mount; we pre-seed
    // state to bypass it and only drive load-more explicitly.
    useEffect() {},
    createContext: () => ({ Provider: "provider" }),
    useContext: () => null,
  };

  // Controlled GET: first call fails (simulating load-more failure), second succeeds.
  const axiosGet = async (path, config) => {
    getCallCount++;
    if (failNextGet) {
      failNextGet = false;
      throw new Error("Network error");
    }
    const cursor = config?.params?.cursor;
    if (cursor === PAGE1_CURSOR) {
      return { data: { tweets: page2, hasMore: false, nextCursor: null } };
    }
    return { data: { tweets: page1, hasMore: true, nextCursor: PAGE1_CURSOR } };
  };

  const uiStubs = {
    Tabs: "div", TabsList: "div", TabsTrigger: "button",
    Card: "div", CardContent: "div",
  };

  const overrides = {
    react,
    "react/jsx-runtime": jsx,
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "aaa".padEnd(24, "0") } }) },
    "@/lib/axiosInstance": { default: { get: axiosGet }, __esModule: true },
    "./ui/tabs": uiStubs,
    "./ui/card": uiStubs,
    "./TweetCard": { default: "article", __esModule: true },
    "./TweetComposer": { default: () => null, __esModule: true },
    "lucide-react": { Feather: "svg" },
  };

  const originalConsoleError = console.error;
  console.error = () => {};   // suppress expected "Failed to fetch tweets" log

  try {
    const { default: Feed } = compile("components/Feed.tsx", overrides);

    // ── PHASE A: first page already in state — verify initial UI controls ──
    // NOTE: elements() cannot traverse React array children (tweets.map(...)),
    // so article counts are verified via state[0] directly — the same data
    // that drives the real render. UI controls that appear as non-array JSX
    // children (buttons, banners, sentinel text) ARE reachable via elements().
    const render = () => { stateIndex = 0; refIndex = 0; return Feed({}); };
    let tree = render();
    let nodes = elements(tree);

    // State-level: 20 tweets from page 1 are in the state box.
    assert.equal(state[0].length, page1.length,
      `Expected ${page1.length} tweets in state on first render, got ${state[0].length}`);
    assert.equal(state[4], true, "hasMore must be true before load-more");

    // UI-level: "Load more" button present (hasMore=true, nextCursor set).
    const loadMoreBtn1 = nodes.find(n => n.type === "button" && n.props?.children === "Load more");
    assert.ok(loadMoreBtn1, "Load more button must be present after first page");

    // UI-level: no error banner on the initial render.
    assert.equal(nodes.find(n => n.props?.role === "alert"), undefined,
      "No error banner should be present before any load-more attempt");

    // ── PHASE B: click Load more — injected network failure ────────────────
    failNextGet = true;
    await loadMoreBtn1.props.onClick();

    tree = render();
    nodes = elements(tree);

    // State-level: tweets array unchanged — no items lost on failure.
    assert.equal(state[0].length, page1.length,
      `After load-more failure, tweets must still hold ${page1.length} items`);

    // State-level: cursor preserved so retry re-uses the same cursor.
    assert.equal(state[3], PAGE1_CURSOR, "nextCursor must be preserved after failure");

    // State-level: feedError set.
    assert.match(String(state[6]), /Could not load posts/i,
      "feedError must contain the error message after failure");

    // UI-level: error banner visible.
    const errorBanner1 = nodes.find(n => n.props?.role === "alert");
    assert.ok(errorBanner1, "Error banner must appear in the rendered tree after failure");

    // UI-level: Retry button present.
    const retryBtn = nodes.find(n => n.type === "button" &&
      String(n.props?.children).toLowerCase() === "retry");
    assert.ok(retryBtn, "Retry button must be present in the error banner");

    // ── PHASE C: click Retry — successful re-fetch of page 2 ───────────────
    await retryBtn.props.onClick();

    tree = render();
    nodes = elements(tree);

    // State-level: feedError cleared.
    assert.equal(state[6], "", "feedError must clear after successful retry");

    // State-level: 22 posts (page 1 + page 2), no extras.
    assert.equal(state[0].length, page1.length + page2.length,
      `After retry, tweets must hold ${page1.length + page2.length} items; got ${state[0].length}`);

    // State-level: uniqueness — Map-merge in fetchTweets prevents duplicates.
    const ids = state[0].map(t => t._id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length,
      "Feed state must contain no duplicate tweet IDs after retry");

    // State-level: every page-2 post is present.
    for (const tweet of page2) {
      assert.ok(unique.has(tweet._id),
        `Page-2 tweet ${tweet._id} missing from feed state after retry`);
    }

    // State-level: every page-1 post is still present.
    for (const tweet of page1) {
      assert.ok(unique.has(tweet._id),
        `Page-1 tweet ${tweet._id} was lost from feed state after retry`);
    }

    // State-level: hasMore reflects the server's final-page signal.
    assert.equal(state[4], false, "hasMore must be false after the final page loads");

    // UI-level: error banner gone.
    const errorBanner2 = nodes.find(n => n.props?.role === "alert");
    assert.equal(errorBanner2, undefined, "Error banner must clear after successful retry");

    // UI-level: "Load more" button gone (hasMore=false).
    const loadMoreBtn2 = nodes.find(n => n.type === "button" && n.props?.children === "Load more");
    assert.equal(loadMoreBtn2, undefined, "Load more button must disappear when hasMore is false");

    // UI-level: "You're all caught up!" sentinel visible.
    const caughtUp = nodes.find(n =>
      typeof n.props?.children === "string" && n.props.children.includes("all caught up"));
    assert.ok(caughtUp, "'You're all caught up!' sentinel must appear after the final page");

    // Exactly 2 GET calls: 1 failed load-more + 1 successful retry.
    // The initial page-load GET is bypassed by the pre-seeded state.
    assert.equal(getCallCount, 2,
      `Expected exactly 2 GET requests (1 failed + 1 retry); saw ${getCallCount}`);

  } finally {
    console.error = originalConsoleError;
  }
});

const circleFixture = () => ({ _id: "000000000000000000000456", slug: "ai-builders", name: "AI Builders", description: "Build together", status: "active", visibility: "public", membershipRole: null, memberCount: 1, relatedTopics: [] });
test("Circle chip and membership control use canonical route and server-derived membership", async () => {
  const { default: Chip } = compile("components/CircleChip.tsx", { "react/jsx-runtime": jsx, "next/link": "a" });
  let stops = 0; const link = Chip({ circle: circleFixture() }); assert.equal(link.props.href, "/circle/ai-builders");
  link.props.onClick({ stopPropagation() { stops++; } }); assert.equal(stops, 1); assert.equal(Chip({ circle: null }), null);
  const h = hooks(), pending = deferred(); let changed; let calls = 0;
  const { default: Membership } = compile("components/CircleMembershipButton.tsx", {
    react: h.react, "react/jsx-runtime": jsx, "@/context/AuthContext": { useAuth: () => ({ user: { _id: "member" } }) },
    "@/lib/axiosInstance": { __esModule: true, default: { put: () => { calls++; return pending.promise; }, delete: async () => ({ data: { membershipRole: null, memberCount: 1 } }) } },
  });
  const render = () => { h.reset(); return Membership({ circle: circleFixture(), onChange: value => { changed = value; } }); };
  let tree = render(); h.effects[0](); let button = findElement(tree, node => node.type === "button");
  button.props.onClick(); button.props.onClick(); assert.equal(calls, 1);
  pending.resolve({ data: { membershipRole: "member", memberCount: 2 } }); await settleTopics(); tree = render();
  button = findElement(tree, node => node.type === "button"); assert.equal(button.props["aria-pressed"], true); assert.equal(changed.memberCount, 2);
  button.props.onClick(); await settleTopics(); tree = render(); assert.equal(findElement(tree, node => node.type === "button").props["aria-pressed"], false);
});
test("Discover Circles separates loading, content, empty and failure with retry", async () => {
  const previousTimeout = globalThis.setTimeout, previousClear = globalThis.clearTimeout;
  globalThis.setTimeout = action => { action(); return 0; }; globalThis.clearTimeout = () => {};
  try {
    for (const scenario of ["content", "empty", "error"]) {
      const h = hooks(), pending = deferred(); const { appendUniquePage } = compile("lib/profile-posts.ts", {});
      const { default: Directory } = compile("components/CirclesDirectory.tsx", {
        react: h.react, "react/jsx-runtime": jsx, "next/link": "a", "./CircleMembershipButton": "Membership",
        "@/lib/profile-posts": { appendUniquePage }, "@/context/AuthContext": { useAuth: () => ({ user: { _id: "owner" } }) },
        "@/lib/axiosInstance": { __esModule: true, default: { get: () => pending.promise } },
      });
      const render = () => { h.reset(); return Directory({ query: "AI" }); };
      let tree = render(); assert.ok(findElement(tree, node => node.type === "RowSkeleton")); h.effects[0]();
      if (scenario === "error") pending.reject(Error("offline")); else pending.resolve({ data: { circles: scenario === "content" ? [circleFixture()] : [], hasMore: false, nextCursor: null } });
      await settleTopics(); tree = render(); assert.equal(findElement(tree, node => node.type === "RowSkeleton"), undefined);
      if (scenario === "content") { assert.equal(findElement(tree, node => node.type === "a").props.href, "/circle/ai-builders"); assert.ok(findElement(tree, node => node.type === "Membership")); }
      else if (scenario === "error") { assert.ok(findElement(tree, node => node.props?.role === "alert")); assert.match(elementText(tree), /Retry Circles/); }
      else assert.match(elementText(tree), /No matching Circles/);
    }
  } finally { globalThis.setTimeout = previousTimeout; globalThis.clearTimeout = previousClear; }
});
test("Circle page displays genuine empty/error states and a canonical post after loading", async () => {
  for (const scenario of ["content", "empty", "error"]) {
    const h = hooks(), pending = deferred(); const { appendUniquePage } = compile("lib/profile-posts.ts", {});
    const prior = Object.getOwnPropertyDescriptor(globalThis, "window"); globalThis.window = { addEventListener() {}, removeEventListener() {} };
    try {
      const { default: Page } = compile("components/CirclePage.tsx", {
        react: h.react, "react/jsx-runtime": jsx, "next/link": "a", "./CircleMembershipButton": "Membership", "./TweetCard": "Post",
        "@/lib/profile-posts": { appendUniquePage }, "@/context/AuthContext": { useAuth: () => ({ user: { _id: "member" } }) },
        "@/lib/axiosInstance": { __esModule: true, default: { get: path => path.endsWith("/feed") ? pending.promise : Promise.resolve({ data: circleFixture() }) } },
      });
      const render = () => { h.reset(); return Page({ slug: "ai-builders" }); };
      let tree = render(); assert.ok(findElement(tree, node => node.type === "PostSkeleton")); h.effects[0](); await settleTopics();
      if (scenario === "error") pending.reject(Error("offline")); else pending.resolve({ data: { tweets: scenario === "content" ? [{ _id: "post", circle: circleFixture() }] : [], hasMore: false, nextCursor: null } });
      await settleTopics(); tree = render(); assert.equal(findElement(tree, node => node.type === "PostSkeleton"), undefined);
      if (scenario === "content") assert.ok(findElement(tree, node => node.type === "Post"));
      else if (scenario === "error") { assert.match(elementText(tree), /Retry Circle/); assert.doesNotMatch(elementText(tree), /No conversations/); }
      else assert.match(elementText(tree), /No conversations in this Circle yet/);
    } finally { prior ? Object.defineProperty(globalThis, "window", prior) : delete globalThis.window; }
  }
});
test("Composer Circle selector keeps public default and exposes only joined Circle options", async () => {
  const h = hooks(), pending = deferred();
  const { default: Selector } = compile("components/CircleSelector.tsx", {
    react: h.react, "react/jsx-runtime": jsx, "@/context/AuthContext": { useAuth: () => ({ user: { _id: "member" } }) },
    "@/lib/axiosInstance": { __esModule: true, default: { get: () => pending.promise } },
  });
  let chosen = null; const render = () => { h.reset(); return Selector({ selected: chosen, onChange: value => { chosen = value; } }); };
  let tree = render(); assert.equal(findElement(tree, node => node.type === "select").props.value, ""); h.effects[0]();
  pending.resolve({ data: { circles: [{ ...circleFixture(), membershipRole: "member" }, { ...circleFixture(), _id: "not-joined", membershipRole: null }, { ...circleFixture(), _id: "disabled", status: "disabled", membershipRole: "member" }], hasMore: false, nextCursor: null } }); await settleTopics();
  tree = render(); const select = findElement(tree, node => node.type === "select");
  assert.equal(findElement(tree, node => node.type === "option" && node.props.value === "").props.children, "Public post");
  assert.ok(findElement(tree, node => node.type === "option" && node.props.value === circleFixture()._id));
  assert.equal(findElement(tree, node => node.type === "option" && node.props.value === "not-joined"), undefined);
  assert.equal(findElement(tree, node => node.type === "option" && node.props.value === "disabled"), undefined);
  select.props.onChange({ target: { value: circleFixture()._id } }); assert.equal(chosen.slug, "ai-builders");
  select.props.onChange({ target: { value: "unknown" } }); assert.equal(chosen, null);
});
test("Circle creation dialog sends only editable fields and adopts the canonical created Circle", async () => {
  const h = hooks(), calls = []; let created;
  const { default: Dialog } = compile("components/CircleCreateDialog.tsx", {
    react: h.react, "react/jsx-runtime": jsx, "./TopicSelector": "TopicSelector",
    "@/lib/axiosInstance": { __esModule: true, default: { post: async (path, body) => { calls.push([path, body]); return { data: circleFixture() }; } } },
  });
  const render = () => { h.reset(); return Dialog({ open: true, onClose() {}, onCreated: value => { created = value; } }); };
  let tree = render(); const inputs = elements(tree).filter(node => node.type === "input" || node.type === "textarea");
  inputs[0].props.onChange({ target: { value: " AI Builders " } }); inputs[1].props.onChange({ target: { value: " Build together " } });
  tree = render(); await findElement(tree, node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls[0], ["/circles", { name: "AI Builders", description: "Build together", relatedTopicIds: [] }]);
  assert.equal(created.slug, "ai-builders");
});
test("Circle members page keeps loading, empty and failure distinct", async () => {
  for (const scenario of ["content", "empty", "error"]) {
    const h = hooks(), pending = deferred();
    const { default: Page } = compile("components/CircleMembersPage.tsx", {
      react: h.react, "react/jsx-runtime": jsx, "next/link": "a",
      "@/lib/axiosInstance": { __esModule: true, default: { get: path => path.endsWith("/members") ? pending.promise : Promise.resolve({ data: circleFixture() }) } },
    });
    const render = () => { h.reset(); return Page({ slug: "ai-builders" }); };
    let tree = render(); assert.ok(findElement(tree, node => node.type === "RowSkeleton")); h.effects[0](); await settleTopics();
    if (scenario === "error") pending.reject(Error("offline")); else pending.resolve({ data: { members: scenario === "content" ? [{ user: { _id: "member", username: "maker", displayName: "Maker" }, role: "owner", joinedAt: "2026-01-01" }] : [], hasMore: false, nextCursor: null } });
    await settleTopics(); tree = render(); assert.equal(findElement(tree, node => node.type === "RowSkeleton"), undefined);
    if (scenario === "content") assert.match(elementText(tree), /Maker.*Owner/);
    else if (scenario === "error") { assert.match(elementText(tree), /Retry members/); assert.doesNotMatch(elementText(tree), /No members yet/); }
    else assert.match(elementText(tree), /No members yet/);
  }
});
test("Composer posts to a chosen joined Circle without changing the public default contract", async () => {
  const h = hooks(), calls = []; const initialState = h.react.useState; let count = 0;
  h.react.useState = initial => initialState(count++ === 0 ? "Circle draft" : initial);
  const controls = { Button: "button", Card: "div", CardContent: "div", Avatar: "div", AvatarFallback: "span", AvatarImage: "img", Textarea: "textarea", Separator: "hr" };
  const overrides = { react: h.react, "react/jsx-runtime": jsx,
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "member", username: "member", email: "member@example.test", plan: "gold", tweetCount: 0 }, refreshUser: async () => {} }) },
    "@/lib/axiosInstance": { __esModule: true, default: { post: async (path, body) => { calls.push([path, body]); return { data: { _id: "post", circle: circleFixture() } }; } } },
    "@/lib/media": { uploadMedia: async () => ({ url: "" }), mediaErrorMessage: () => "error" },
    "lucide-react": Object.fromEntries(["Image", "Smile", "Calendar", "MapPin", "BarChart3", "Globe", "Crown", "Lock", "Mic"].map(key => [key, "svg"])) };
  for (const path of ["card", "avatar", "textarea", "button", "separator"]) overrides[`./ui/${path}`] = controls;
  const { default: Composer } = compile("components/TweetComposer.tsx", overrides);
  const render = () => { count = 0; h.reset(); return Composer({ onTweetPosted() {} }); };
  let tree = render(); findElement(tree, node => node.type === "CircleSelector").props.onChange(circleFixture());
  tree = render(); await findElement(tree, node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(calls[0][0], "/post"); assert.equal(calls[0][1].circleId, circleFixture()._id);
  assert.deepEqual(calls[0][1].topicIds, []);
});
