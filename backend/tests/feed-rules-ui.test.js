import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(new URL("../../twiller/package.json", import.meta.url));
const ts = require("typescript");
const jsx = require("react/jsx-runtime");

function hooks() {
  const slots = []; let index = 0; let idCounter = 0; const effects = [];
  return {
    reset() { index = 0; }, effects,
    react: {
      createContext: () => ({ Provider: "provider" }),
      useContext: () => null,
      useState(initial) {
        const i = index++;
        if (!(i in slots)) slots[i] = initial;
        return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
      },
      useRef(initial) {
        const i = index++;
        if (!(i in slots)) slots[i] = { current: initial };
        return slots[i];
      },
      useCallback(callback) { index++; return callback; },
      useMemo(factory) { index++; return factory(); },
      useId() { return `test-id-${++idCounter}`; },
      useEffect(effect) {
        const i = index++;
        if (!(i in slots)) { slots[i] = true; effects.push(effect); }
      },
    },
  };
}

function compile(relative, overrides = {}) {
  const filename = new URL(`../../twiller/src/${relative}`, import.meta.url);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: filename.pathname })(
    name => (name in overrides ? overrides[name] : require(name)),
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

function elementText(node) {
  if (Array.isArray(node)) return node.map(elementText).join("");
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  return elementText(node.props?.children);
}

test("FeedRulesPanel: helper formatting functions formatRuleLabel and formatDurationLabel", () => {
  const h = hooks();
  const { formatRuleLabel, formatDurationLabel } = compile("components/FeedRulesPanel.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "@/lib/axiosInstance": { get: () => Promise.resolve({ data: {} }) },
  });

  // formatRuleLabel
  assert.equal(formatRuleLabel({ ruleType: "only_following" }), "Only people I follow");
  assert.equal(formatRuleLabel({ ruleType: "hide_media" }), "Hide media");
  assert.equal(formatRuleLabel({ ruleType: "hide_topic", target: { name: "Artificial Intelligence" } }), "Hide Artificial Intelligence");
  assert.equal(formatRuleLabel({ ruleType: "hide_topic", target: null }), "Hide Topic");
  assert.equal(formatRuleLabel({ ruleType: "boost_topic", target: { name: "Web Development" } }), "Show more Web Development");
  assert.equal(formatRuleLabel({ ruleType: "reduce_topic", target: { name: "Crypto" } }), "Show less Crypto");
  assert.equal(formatRuleLabel({ ruleType: "prioritize_circle", target: { name: "Designers Club" } }), "Prioritize Designers Club");

  // formatDurationLabel
  assert.equal(formatDurationLabel("one_hour"), "1 hour");
  assert.equal(formatDurationLabel("today"), "Today");
  assert.equal(formatDurationLabel("seven_days"), "7 days");
  assert.equal(formatDurationLabel("until_removed"), "Until turned off");
});

test("FeedRulesPanel: renders zero rule empty state vs active rules list", () => {
  const h = hooks();
  const { default: FeedRulesPanel } = compile("components/FeedRulesPanel.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "@/lib/axiosInstance": { get: () => Promise.resolve({ data: {} }), post: () => Promise.resolve({ data: {} }) },
  });

  let closed = false;
  // 1. Zero rules
  h.reset();
  const zeroTree = FeedRulesPanel({
    open: true,
    onClose: () => { closed = true; },
    rules: [],
    onRuleCreated: () => {},
    onRuleDeleted: () => {},
  });

  const zeroText = elementText(zeroTree);
  assert.match(zeroText, /No active feed rules/);
  assert.match(zeroText, /Add rule/);

  // 2. Active rules
  h.reset();
  const activeTree = FeedRulesPanel({
    open: true,
    onClose: () => {},
    rules: [
      { _id: "r1", ruleType: "only_following", duration: "one_hour", expiresAt: "2026-10-15T13:00:00Z" },
      { _id: "r2", ruleType: "hide_topic", target: { name: "Sports" }, duration: "today", expiresAt: "2026-10-16T00:00:00Z" },
    ],
    onRuleCreated: () => {},
    onRuleDeleted: () => {},
  });

  const activeText = elementText(activeTree);
  assert.match(activeText, /Active rules \(2\)/);
  assert.match(activeText, /Only people I follow/);
  assert.match(activeText, /1 hour/);
  assert.match(activeText, /Hide Sports/);
  assert.match(activeText, /Today/);

  // 3. Close button
  const closeBtn = findElement(zeroTree, node => node.type === "button" && node.props?.["aria-label"] === "Close feed rules");
  assert.ok(closeBtn, "Close button must be present");
  closeBtn.props.onClick();
  assert.equal(closed, true);

  // 4. Closed state returns null
  assert.equal(FeedRulesPanel({ open: false, onClose: () => {}, rules: [], onRuleCreated: () => {}, onRuleDeleted: () => {} }), null);
});

test("FeedRulesPanel: remove button triggers deletion", () => {
  const h = hooks();
  let deletedTargetUrl = null;
  const { default: FeedRulesPanel } = compile("components/FeedRulesPanel.tsx", {
    react: h.react,
    "react/jsx-runtime": jsx,
    "@/lib/axiosInstance": {
      delete: (url) => {
        deletedTargetUrl = url;
        return Promise.resolve({ data: { success: true } });
      },
      get: () => Promise.resolve({ data: {} }),
    },
  });

  let deletedId = null;
  h.reset();
  const tree = FeedRulesPanel({
    open: true,
    onClose: () => {},
    rules: [{ _id: "r1", ruleType: "only_following", duration: "one_hour", expiresAt: null }],
    onRuleCreated: () => {},
    onRuleDeleted: (id) => { deletedId = id; },
  });

  const removeBtn = findElement(tree, node => node.type === "button" && node.props?.["aria-label"]?.includes("Remove rule"));
  assert.ok(removeBtn, "Remove rule button must be rendered");
  removeBtn.props.onClick();
  assert.equal(deletedTargetUrl, "/feed-rules/r1");
});
