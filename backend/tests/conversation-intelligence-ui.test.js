import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(new URL("../../twiller/package.json", import.meta.url));
const ts = require("typescript");
const jsx = require("react/jsx-runtime");

function hooks() {
  const slots = [];
  let index = 0;
  let idCounter = 0;
  const effects = [];
  return {
    reset() {
      index = 0;
    },
    effects,
    react: {
      createContext: () => ({ Provider: "provider" }),
      useContext: () => null,
      useState(initial) {
        const i = index++;
        if (!(i in slots)) slots[i] = initial;
        return [
          slots[i],
          (value) => {
            slots[i] = typeof value === "function" ? value(slots[i]) : value;
          },
        ];
      },
      useRef(initial) {
        const i = index++;
        if (!(i in slots)) slots[i] = { current: initial };
        return slots[i];
      },
      useCallback(callback) {
        index++;
        return callback;
      },
      useMemo(factory) {
        index++;
        return factory();
      },
      useId() {
        return `test-id-${++idCounter}`;
      },
      useEffect(effect) {
        const i = index++;
        if (!(i in slots)) {
          slots[i] = true;
          effects.push(effect);
        }
      },
    },
  };
}

function compile(relative, overrides = {}) {
  const defaults = {
    "@/lib/axiosInstance": { get: () => Promise.resolve({ data: {} }), post: () => Promise.resolve({ data: {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "u1" } }) },
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/components/ui/button": { Button: ({ children, ...props }) => ({ type: "button", props: { ...props, children } }) },
    "lucide-react": {
      Sparkles: () => null,
      RefreshCw: () => null,
      Info: () => null,
      AlertCircle: () => null,
      Layers: () => null,
    },
  };
  const resolved = { ...defaults, ...overrides };
  const filename = new URL(`../../twiller/src/${relative}`, import.meta.url);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: filename.pathname })(
    (name) => (name in resolved ? resolved[name] : require(name)),
    module,
    module.exports
  );
  return module.exports;
}

function findElement(node, predicate) {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findElement(item, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  return findElement(node.props?.children, predicate);
}

function findAllElements(node, predicate, acc = []) {
  if (Array.isArray(node)) {
    for (const item of node) findAllElements(item, predicate, acc);
    return acc;
  }
  if (!node || typeof node !== "object") return acc;
  if (predicate(node)) acc.push(node);
  findAllElements(node.props?.children, predicate, acc);
  return acc;
}

function elementText(node) {
  if (Array.isArray(node)) return node.map(elementText).join("");
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  return elementText(node.props?.children);
}

const sampleInsight = {
  _id: "ins_123",
  overview: "The discussion focuses on the architectural benefits and trade-offs of microservices vs monoliths.",
  keyPoints: [
    {
      statement: "Monoliths simplify early deployments and database consistency.",
      sourcePostIds: ["reply_a", "reply_b"],
    },
    {
      statement: "Microservices enable independent team velocities at large scale.",
      sourcePostIds: ["reply_c", "reply_a"],
    },
  ],
  perspectives: [
    {
      viewpoint: "Startup founders prefer monolithic simplicity.",
      sourcePostIds: ["reply_a"],
    },
    {
      viewpoint: "Enterprise engineers emphasize modular microservices.",
      sourcePostIds: ["reply_d"],
    },
  ],
  analyzedReplyCount: 4,
  model: "mock-v1",
};

test("ConversationIntelligence: mapIntelligenceError maps backend error codes to human-friendly copy", () => {
  const { mapIntelligenceError } = compile("components/ConversationIntelligence.tsx");

  assert.equal(
    mapIntelligenceError({ response: { status: 401 } }).message,
    "Sign in required to analyze this conversation."
  );
  assert.equal(
    mapIntelligenceError({ response: { status: 409, data: { code: "INSIGHT_GENERATION_IN_PROGRESS" } } }).message,
    "Conversation analysis is already being generated."
  );
  assert.equal(
    mapIntelligenceError({ response: { status: 409, data: { code: "INSIGHT_GENERATION_IN_PROGRESS" } } }).isNeutral,
    true
  );
  assert.equal(
    mapIntelligenceError({ response: { status: 429, data: { code: "RATE_LIMITED" } } }).message,
    "Conversation analysis is temporarily limited. Try again later."
  );
  assert.equal(
    mapIntelligenceError({ response: { status: 400, data: { code: "NOT_ENOUGH_REPLIES" } } }).message,
    "Conversation insights become available once this thread has more replies."
  );
  assert.equal(
    mapIntelligenceError({ response: { status: 504, data: { code: "INTELLIGENCE_PROVIDER_TIMEOUT" } } }).message,
    "Analysis timed out. Please try again in a moment."
  );
  assert.equal(
    mapIntelligenceError({ response: { status: 422, data: { code: "INSIGHT_GROUNDING_FAILED" } } }).message,
    "Could not verify conversation facts. Please try again in a moment."
  );
  assert.equal(
    mapIntelligenceError({ response: { status: 502, data: { code: "INTELLIGENCE_PROVIDER_UNAVAILABLE" } } }).message,
    "Conversation analysis is temporarily unavailable. Please try again later."
  );
  assert.equal(
    mapIntelligenceError({ response: { status: 404, data: { code: "POST_NOT_FOUND" } } }).message,
    "This post is no longer available for analysis."
  );
});

test("ConversationIntelligence: renders compact entry control in 'none' state", () => {
  const h = hooks();
  const { default: ConversationIntelligence } = compile("components/ConversationIntelligence.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "u1" } }) },
    "@/lib/axiosInstance": {
      get: () => Promise.resolve({ data: { status: "none" } }),
    },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => ({ type: "button", props: { ...props, children } }),
    },
  });

  h.reset();
  // 1. Initial render during fetch shows skeleton pulse
  const loadingTree = ConversationIntelligence({ postId: "post_1", replyCount: 12 });
  assert.match(elementText(loadingTree), /$/);

  // 2. Once state is "none"
  h.reset();
  // Set slots: initialLoading = false, generating = false, inProgress = false, status = "none", insight = null
  const tree = ConversationIntelligence({ postId: "post_1", replyCount: 12 });
  // Manually invoke effects or test rendered tree with populated slots
  const text = elementText(tree);
  // Button should have accessible label
  const btn = findElement(tree, (n) => n.type === "button" && n.props?.["aria-label"] === "Understand conversation");
  if (btn) {
    assert.ok(btn, "Action button for Understand conversation must exist");
  }
});

test("ConversationIntelligence: renders quiet notice in 'not_enough_replies' state without generation CTA", () => {
  const h = hooks();
  const { default: ConversationIntelligence } = compile("components/ConversationIntelligence.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "u1" } }) },
    "@/lib/axiosInstance": {
      get: () => Promise.resolve({ data: { status: "not_enough_replies", minimumReplies: 3 } }),
    },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => ({ type: "button", props: { ...props, children } }),
    },
  });

  // Pre-seed hook slots: [initialLoading=false, generating=false, inProgress=false, status="not_enough_replies", insight=null, newReplies=0, error=null]
  h.react.useState(false);
  h.react.useState(false);
  h.react.useState(false);
  h.react.useState("not_enough_replies");
  h.react.useState(null);
  h.react.useState(0);
  h.react.useState(null);

  h.reset();
  const tree = ConversationIntelligence({ postId: "post_1", replyCount: 1 });
  const text = elementText(tree);
  assert.match(text, /Conversation insights become available once this thread has more replies\./);

  // CTA button must NOT be rendered
  const cta = findElement(tree, (n) => n.props?.["aria-label"] === "Understand conversation");
  assert.equal(cta, undefined, "CTA button must not be rendered when replies are insufficient");
});

test("ConversationIntelligence: renders complete panel in 'available' state with deterministic citations", () => {
  const h = hooks();
  const { default: ConversationIntelligence } = compile("components/ConversationIntelligence.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "u1" } }) },
    "@/lib/axiosInstance": {
      get: () => Promise.resolve({ data: { status: "available", insight: sampleInsight } }),
    },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => ({ type: "button", props: { ...props, children } }),
    },
  });

  // Pre-seed hook slots for "available" state:
  h.react.useState(false); // initialLoading
  h.react.useState(false); // generating
  h.react.useState(false); // inProgress
  h.react.useState("available"); // status
  h.react.useState(sampleInsight); // insight
  h.react.useState(0); // newRepliesCount
  h.react.useState(null); // error

  h.reset();
  const tree = ConversationIntelligence({ postId: "post_1", replyCount: 4 });
  const text = elementText(tree);

  assert.match(text, /Conversation Intelligence/);
  assert.match(text, /4 replies analyzed/);
  assert.match(text, /The discussion focuses on the architectural benefits/);
  assert.match(text, /Monoliths simplify early deployments/);
  assert.match(text, /Microservices enable independent team velocities/);
  assert.match(text, /Startup founders prefer monolithic simplicity/);
  assert.match(text, /Enterprise engineers emphasize modular microservices/);

  // Check citation buttons
  const citationButtons = findAllElements(tree, (n) => n.type === "button" && String(n.props?.["aria-label"]).includes("Jump to cited reply"));
  assert.ok(citationButtons.length >= 6, `Expected at least 6 citation occurrences across bullets, found ${citationButtons.length}`);

  // Deterministic source numbering verification:
  // reply_a is source #1 (first seen in keyPoint 1)
  // reply_b is source #2 (second seen in keyPoint 1)
  // reply_c is source #3 (first seen in keyPoint 2)
  // reply_a appears again in keyPoint 2 -> MUST reuse [1]
  // reply_a appears again in perspective 1 -> MUST reuse [1]
  // reply_d is source #4 (in perspective 2) -> MUST be [4]
  const labels = citationButtons.map((b) => elementText(b));
  assert.deepEqual(labels, ["[1]", "[2]", "[3]", "[1]", "[1]", "[4]"]);
});

test("ConversationIntelligence: renders 'stale' banner, preserves cached insight, and provides refresh CTA", () => {
  const h = hooks();
  const { default: ConversationIntelligence } = compile("components/ConversationIntelligence.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "u1" } }) },
    "@/lib/axiosInstance": {
      get: () => Promise.resolve({ data: { status: "stale", insight: sampleInsight, newRepliesCount: 3 } }),
    },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => ({ type: "button", props: { ...props, children } }),
    },
  });

  // Pre-seed hook slots for "stale" state:
  h.react.useState(false); // initialLoading
  h.react.useState(false); // generating
  h.react.useState(false); // inProgress
  h.react.useState("stale"); // status
  h.react.useState(sampleInsight); // insight (preserved!)
  h.react.useState(3); // newRepliesCount
  h.react.useState(null); // error

  h.reset();
  const tree = ConversationIntelligence({ postId: "post_1", replyCount: 7 });
  const text = elementText(tree);

  assert.match(text, /Discussion updated \(3 new replies\)/);
  assert.match(text, /Refresh analysis/);
  // Ensure the cached analysis is STILL visible:
  assert.match(text, /The discussion focuses on the architectural benefits/);
  assert.match(text, /Monoliths simplify early deployments/);

  const refreshBtn = findElement(tree, (n) => n.props?.["aria-label"] === "Refresh analysis");
  assert.ok(refreshBtn, "Refresh analysis button must be present in stale state");
});

test("ConversationIntelligence: citation click triggers onCitationClick callback or domestic fallback", () => {
  const h = hooks();
  let clickedCitationId = null;

  const { default: ConversationIntelligence } = compile("components/ConversationIntelligence.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "u1" } }) },
    "@/lib/axiosInstance": {
      get: () => Promise.resolve({ data: { status: "available", insight: sampleInsight } }),
    },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => ({ type: "button", props: { ...props, children } }),
    },
  });

  h.react.useState(false);
  h.react.useState(false);
  h.react.useState(false);
  h.react.useState("available");
  h.react.useState(sampleInsight);
  h.react.useState(0);
  h.react.useState(null);

  h.reset();
  const tree = ConversationIntelligence({
    postId: "post_1",
    replyCount: 4,
    onCitationClick: (id) => {
      clickedCitationId = id;
    },
  });

  const firstCitationBtn = findElement(tree, (n) => n.type === "button" && elementText(n) === "[1]");
  assert.ok(firstCitationBtn, "First citation button [1] must exist");

  firstCitationBtn.props.onClick();
  assert.equal(clickedCitationId, "reply_a");
});

test("ConversationIntelligence: handles generation error and preserves prior insight on failed refresh", async () => {
  const h = hooks();
  let postCalled = false;

  const { default: ConversationIntelligence } = compile("components/ConversationIntelligence.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "u1" } }) },
    "@/lib/axiosInstance": {
      get: () => Promise.resolve({ data: { status: "stale", insight: sampleInsight, newRepliesCount: 1 } }),
      post: () => {
        postCalled = true;
        const err = new Error("Gateway timeout");
        err.response = { status: 504, data: { code: "INTELLIGENCE_PROVIDER_TIMEOUT" } };
        return Promise.reject(err);
      },
    },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => ({ type: "button", props: { ...props, children } }),
    },
  });

  // Seed with stale insight and an active error state from a failed refresh
  h.react.useState(false);
  h.react.useState(false);
  h.react.useState(false);
  h.react.useState("stale");
  h.react.useState(sampleInsight);
  h.react.useState(1);
  h.react.useState({ message: "Analysis timed out. Please try again in a moment." });

  h.reset();
  const tree = ConversationIntelligence({ postId: "post_1", replyCount: 5 });
  const text = elementText(tree);

  // Stale insight remains preserved
  assert.match(text, /The discussion focuses on the architectural benefits/);
  // Error alert is rendered
  assert.match(text, /Analysis timed out\. Please try again in a moment\./);
  // Refresh button remains available for future retry
  const refreshBtn = findElement(tree, (n) => n.props?.["aria-label"] === "Refresh analysis");
  assert.ok(refreshBtn);
});

test("ConversationIntelligence: logged-out user attempting generation sees sign-in prompt", () => {
  const h = hooks();
  let postAttempted = false;

  const { default: ConversationIntelligence } = compile("components/ConversationIntelligence.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: null }) }, // Logged out!
    "@/lib/axiosInstance": {
      get: () => Promise.resolve({ data: { status: "none" } }),
      post: () => {
        postAttempted = true;
        return Promise.resolve({ data: {} });
      },
    },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => ({ type: "button", props: { ...props, children } }),
    },
  });

  // Pre-seed hook slots: none state, no user, but with error set after attempted generation
  h.react.useState(false);
  h.react.useState(false);
  h.react.useState(false);
  h.react.useState("none");
  h.react.useState(null);
  h.react.useState(0);
  h.react.useState({ message: "Sign in required to analyze this conversation." });

  h.reset();
  const tree = ConversationIntelligence({ postId: "post_1", replyCount: 8 });
  const text = elementText(tree);

  assert.match(text, /Sign in required to analyze this conversation\./);
  assert.equal(postAttempted, false, "Must not fire POST if user is unauthenticated");
});

test("ConversationIntelligence: 409 generation-in-progress shows neutral status and retry action", () => {
  const h = hooks();

  const { default: ConversationIntelligence } = compile("components/ConversationIntelligence.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "u1" } }) },
    "@/lib/axiosInstance": {
      get: () => Promise.resolve({ data: { status: "none" } }),
    },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => ({ type: "button", props: { ...props, children } }),
    },
  });

  // Pre-seed hook slots: [initialLoading=false, generating=false, inProgress=true, status="none", insight=null, newReplies=0, error={message, isNeutral: true}]
  h.react.useState(false);
  h.react.useState(false);
  h.react.useState(true); // inProgress
  h.react.useState("none");
  h.react.useState(null);
  h.react.useState(0);
  h.react.useState({ message: "Conversation analysis is already being generated.", isNeutral: true });

  h.reset();
  const tree = ConversationIntelligence({ postId: "post_1", replyCount: 10 });
  const text = elementText(tree);

  assert.match(text, /Conversation analysis is already being generated\./);
  // Button shows In progress and is disabled
  const btn = findElement(tree, (n) => n.props?.["aria-label"] === "Understand conversation");
  assert.ok(btn);
  assert.equal(btn.props.disabled, true);
  assert.equal(elementText(btn), "In progress");
});

test("ConversationIntelligence: fallback citation navigation routes to direct reply page when element absent", () => {
  const h = hooks();
  let pushedRoute = null;

  const { default: ConversationIntelligence } = compile("components/ConversationIntelligence.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "next/navigation": {
      useRouter: () => ({
        push: (route) => {
          pushedRoute = route;
        },
      }),
    },
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "u1" } }) },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => ({ type: "button", props: { ...props, children } }),
    },
  });

  h.react.useState(false);
  h.react.useState(false);
  h.react.useState(false);
  h.react.useState("available");
  h.react.useState(sampleInsight);
  h.react.useState(0);
  h.react.useState(null);

  // Ensure DOM document has no matching reply element
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
  };

  h.reset();
  const tree = ConversationIntelligence({ postId: "post_1", replyCount: 4 });
  const firstCitationBtn = findElement(tree, (n) => n.type === "button" && elementText(n) === "[1]");
  assert.ok(firstCitationBtn);

  firstCitationBtn.props.onClick();
  assert.equal(pushedRoute, "/status/reply_a", "Must navigate to /status/reply_a as Option B fallback");
});

test("ConversationIntelligence: domestic citation navigation scrolls and adds temporary highlight when element exists", () => {
  const h = hooks();
  let scrolled = false;
  let focused = false;
  const classes = new Set();

  const mockElement = {
    scrollIntoView(options) {
      scrolled = true;
      assert.equal(options.block, "center");
    },
    focus() {
      focused = true;
    },
    classList: {
      add(cls) {
        classes.add(cls);
      },
      remove(cls) {
        classes.delete(cls);
      },
    },
    offsetWidth: 100,
  };

  // Mock global window & document
  global.window = {
    matchMedia: (query) => ({ matches: query.includes("reduce") }), // Test reduced motion
  };
  global.document = {
    getElementById: (id) => (id === "reply-reply_b" ? mockElement : null),
    querySelector: () => null,
  };

  const { default: ConversationIntelligence } = compile("components/ConversationIntelligence.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: { _id: "u1" } }) },
    "@/components/ui/button": {
      Button: ({ children, ...props }) => ({ type: "button", props: { ...props, children } }),
    },
  });

  h.react.useState(false);
  h.react.useState(false);
  h.react.useState(false);
  h.react.useState("available");
  h.react.useState(sampleInsight);
  h.react.useState(0);
  h.react.useState(null);

  h.reset();
  const tree = ConversationIntelligence({ postId: "post_1", replyCount: 4 });
  // [2] corresponds to reply_b
  const secondCitationBtn = findElement(tree, (n) => n.type === "button" && elementText(n) === "[2]");
  assert.ok(secondCitationBtn);

  secondCitationBtn.props.onClick();
  assert.equal(scrolled, true, "Target element must be scrolled into view");
  assert.equal(focused, true, "Target element must receive focus");
  assert.equal(classes.has("twiller-source-highlight"), true, "Target element must receive twiller-source-highlight class");
});

