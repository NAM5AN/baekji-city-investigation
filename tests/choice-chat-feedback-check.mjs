import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("choice-chat-feedback.js", "utf8");
const css = fs.readFileSync("choice-chat-feedback.css", "utf8");
const index = fs.readFileSync("index.html", "utf8");

const bodyClasses = new Set(["mobile-investigation-active", "mobile-investigation-field"]);
const composerClasses = new Set();
let toggleClicks = 0;
let inputEvents = 0;
const delays = [];

const composer = {
  offsetWidth: 320,
  classList: {
    add(name) { composerClasses.add(name); },
    remove(name) { composerClasses.delete(name); },
  },
};
const input = {
  value: "/멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
  closest(selector) { return selector === ".retro-chat-composer" ? composer : null; },
  dispatchEvent(event) { if (event?.type === "input") inputEvents += 1; return true; },
  matches(selector) { return selector === "[data-chat-input]"; },
};
const toggle = {
  click() {
    toggleClicks += 1;
    bodyClasses.delete("mobile-investigation-field");
    bodyClasses.add("mobile-investigation-chat");
  },
};
const listeners = [];
const context = vm.createContext({
  console,
  queueMicrotask,
  Event: class Event { constructor(type, options = {}) { this.type = type; this.bubbles = Boolean(options.bubbles); } },
  document: {
    body: { classList: { contains(name) { return bodyClasses.has(name); } } },
    addEventListener(type, handler, options) { listeners.push({ type, handler, options }); },
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
assert.equal(api.isSendTarget({ closest: (selector) => selector === "[data-send-chat]" ? {} : null }), true);
assert.equal(api.rememberSuggestedInput(), true, "auto-filled choice should be synchronized through a real input event");
assert.equal(inputEvents, 1, "choice fill should emit one input event so app state matches the visible textarea");
assert.equal(api.prepareSendFromSuggestedInput(), true, "unchanged suggested action should be prepared again immediately before send");
assert.equal(inputEvents, 2, "send preparation should emit another input event before the app send handler runs");
assert.equal(api.runChoiceFeedback(), true, "mobile action choice should switch to chat pane");
assert.equal(toggleClicks, 1, "mobile pane toggle should be clicked exactly once");
assert(delays.includes(api.MOBILE_SLIDE_MS), "composer pulse should wait for the mobile slide to finish");
assert(composerClasses.has("choice-chat-attention") || delays.includes(620), "composer should receive the attention pulse");

const captureSend = listeners.find((entry) => entry.type === "click" && entry.options === true);
assert(captureSend, "send synchronization should be installed in capture phase before the app button handler");
assert(source.includes("pendingSuggestedText"), "suggested text should remain available as a fallback until send");
assert(source.includes("new window.Event(\"input\""), "suggested choices must emit a real input event instead of only changing textarea.value");
assert(source.includes("[data-suggested-action]"), "only suggested action choices should trigger this feedback");
assert(source.includes("[data-mobile-investigation-toggle]"), "mobile feedback should use the existing pane switcher");
assert(source.includes("[data-chat-input]"), "feedback should target the chat input composer");
assert(css.includes("@keyframes baekji-choice-chat-attention"), "chat composer pulse animation should exist");
assert(index.includes("choice-chat-feedback.css?v=0.3.74"), "choice feedback CSS should be loaded with the latest cache key");
assert(index.includes("choice-chat-feedback.js?v=0.3.74"), "choice feedback JS should be loaded with the latest cache key");

console.log("PASS: suggested actions sync like manual typing, send without edits, switch mobile to chat, and pulse the composer");
