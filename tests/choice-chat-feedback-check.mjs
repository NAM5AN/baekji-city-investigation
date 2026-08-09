import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("choice-chat-feedback.js", "utf8");
const css = fs.readFileSync("choice-chat-feedback.css", "utf8");
const index = fs.readFileSync("index.html", "utf8");

const bodyClasses = new Set(["mobile-investigation-active", "mobile-investigation-field"]);
const composerClasses = new Set();
let toggleClicks = 0;
const delays = [];

const composer = {
  offsetWidth: 320,
  classList: {
    add(name) { composerClasses.add(name); },
    remove(name) { composerClasses.delete(name); },
  },
};
const input = { closest(selector) { return selector === ".retro-chat-composer" ? composer : null; } };
const toggle = {
  click() {
    toggleClicks += 1;
    bodyClasses.delete("mobile-investigation-field");
    bodyClasses.add("mobile-investigation-chat");
  },
};
const context = vm.createContext({
  console,
  queueMicrotask,
  document: {
    body: { classList: { contains(name) { return bodyClasses.has(name); } } },
    addEventListener() {},
    querySelector(selector) {
      if (selector === "[data-mobile-investigation-toggle]") return toggle;
      if (selector === "[data-chat-input]") return input;
      return null;
    },
  },
});
context.window = context;
context.innerWidth = 390;
context.matchMedia = () => ({ matches: true });
context.clearTimeout = () => {};
context.setTimeout = (fn, delay = 0) => { delays.push(delay); fn(); return 1; };

vm.runInContext(source, context, { filename: "choice-chat-feedback.js" });
const api = context.__BAEKJI_CHOICE_CHAT_FEEDBACK_TEST__;
assert(api, "choice feedback test API should be exposed");
assert.equal(api.isSuggestedActionTarget({ closest: (selector) => selector === "[data-suggested-action]" ? {} : null }), true);
assert.equal(api.runChoiceFeedback(), true, "mobile action choice should switch to chat pane");
assert.equal(toggleClicks, 1, "mobile pane toggle should be clicked exactly once");
assert(delays.includes(api.MOBILE_SLIDE_MS), "composer pulse should wait for the mobile slide to finish");
assert(composerClasses.has("choice-chat-attention") || delays.includes(620), "composer should receive the attention pulse");

assert(source.includes("[data-suggested-action]"), "only suggested action choices should trigger this feedback");
assert(source.includes("[data-mobile-investigation-toggle]"), "mobile feedback should use the existing pane switcher");
assert(source.includes("[data-chat-input]"), "feedback should target the chat input composer");
assert(css.includes("@keyframes baekji-choice-chat-attention"), "chat composer pulse animation should exist");
assert(index.includes("choice-chat-feedback.css?v=0.3.73"), "choice feedback CSS should be loaded with a cache key");
assert(index.includes("choice-chat-feedback.js?v=0.3.73"), "choice feedback JS should be loaded with a cache key");

console.log("PASS: suggested actions switch mobile to chat and pulse the composer without auto-sending");
