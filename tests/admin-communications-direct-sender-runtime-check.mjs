import assert from "node:assert/strict";
import fs from "node:fs";
import { createBrowserContext, createControlledClock, loadScripts } from "./helpers/browser-harness.mjs";

const source = fs.readFileSync(new URL("../admin-communications-mvp3.js", import.meta.url), "utf8");
const dashboard = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const legacyPath = new URL("../admin-system-sender-ui.js", import.meta.url);

class Element {
  constructor({ dataset = {}, value = "" } = {}) {
    this.dataset = dataset;
    this.value = value;
    this.textContent = "";
    this.disabled = false;
    this.listeners = new Map();
  }

  addEventListener(type, callback) { this.listeners.set(type, callback); }
  invoke(type, extra = {}) { this.listeners.get(type)?.({ currentTarget: this, target: this, preventDefault() {}, ...extra }); }
  emit(type, extra = {}) {
    if (this.disabled && type === "click") return;
    this.invoke(type, extra);
  }
  setAttribute(name) { if (name === "disabled") this.disabled = true; }
  focus() { this.focused = true; }
  closest(selector) { return this.matches(selector) ? this : null; }
  matches(selector) {
    return selector === "[data-admin-comm-close]" && this.dataset.adminCommClose !== undefined
      || selector === "[data-admin-system-open]" && this.dataset.adminSystemOpen !== undefined
      || selector === "[data-admin-system-history]" && this.dataset.adminSystemHistory !== undefined;
  }
}

class ModalRoot extends Element {
  constructor() { super(); this.isConnected = false; this._innerHTML = ""; this.nodes = new Map(); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(markup) {
    this._innerHTML = String(markup);
    this.nodes = new Map();
    const add = (selector, node = new Element()) => { this.nodes.set(selector, node); return node; };
    const inputValue = (attribute) => {
      const match = this._innerHTML.match(new RegExp(`${attribute}[^>]*value="([^"]*)"`));
      return match ? match[1].replaceAll("&quot;", "\"").replaceAll("&#039;", "'").replaceAll("&amp;", "&") : "";
    };
    const selectedTarget = this._innerHTML.match(/data-admin-system-target[^>]*>[\s\S]*?<option value="([^"]*)" selected/)?.[1] || "";
    if (this._innerHTML.includes("data-admin-system-message")) {
      add("[data-admin-system-message]", new Element({ value: this._innerHTML.match(/data-admin-system-message[^>]*>([\s\S]*?)<\/textarea>/)?.[1] || "" }));
      add("[data-admin-system-target]", new Element({ value: selectedTarget }));
      const review = add("[data-admin-system-review]");
      review.disabled = /data-admin-system-review[^>]*\sdisabled/.test(this._innerHTML);
      ["ALL", "ZONE", "PARTY", "CHARACTER"].forEach((kind) => add(`[data-admin-system-kind="${kind}"]`, new Element({ dataset: { adminSystemKind: kind } })));
    }
    if (this._innerHTML.includes("data-admin-system-back")) add("[data-admin-system-back]");
    if (this._innerHTML.includes("data-admin-system-confirm-send")) add("[data-admin-system-confirm-send]");
    if (this._innerHTML.includes("data-admin-comm-close")) add("[data-admin-comm-close]", new Element({ dataset: { adminCommClose: "" } }));
    if (this._innerHTML.includes("data-admin-system-sender")) add("[data-admin-system-sender]", new Element({ value: inputValue("data-admin-system-sender") }));
  }
  get childElementCount() { return this._innerHTML ? 1 : 0; }
  replaceChildren() { this.innerHTML = ""; }
  querySelector(selector) { return this.nodes.get(selector) || null; }
  querySelectorAll(selector) {
    if (selector === "[data-admin-system-kind]") return ["ALL", "ZONE", "PARTY", "CHARACTER"].map((kind) => this.nodes.get(`[data-admin-system-kind="${kind}"]`)).filter(Boolean);
    return [];
  }
}

function boot() {
  const modal = new ModalRoot();
  const rail = new Element();
  const status = new Element();
  rail.querySelector = (selector) => ({ "[data-admin-chat-status]": status }[selector] || null);
  const documentListeners = new Map();
  const timers = [];
  let getCount = 0;
  let postCount = 0;
  const postBodies = [];
  const document = {
    body: { append(node) { node.isConnected = true; } },
    querySelector(selector) { return selector === ".admin-chat-rail" ? rail : null; },
    getElementById(id) { return id === "admin-communications-modal-root" && modal.isConnected ? modal : null; },
    createElement() { return modal; },
    addEventListener(type, callback) { documentListeners.set(type, callback); },
    dispatch(type, event) { documentListeners.get(type)?.(event); },
  };
  const fetchImpl = async (url, options = {}) => {
    if (String(url).startsWith("/api/admin-snapshot")) {
      getCount += 1;
      return { ok: true, json: async () => ({ ok: true, state: {
        sessions: { s1: { id: "s1", status: "ACTIVE", partyId: "p1", memberIds: ["a"], currentNode: "E_G_PLAZA" } },
        parties: { p1: { id: "p1", name: "1조", sessionId: "s1", memberIds: ["a"] } },
        characters: { a: { id: "a", currentSessionId: "s1" } },
      }, directory: [{ id: "a", name: "테스트 A" }] }) };
    }
    if (String(url).startsWith("/api/admin-communications")) {
      if (String(options.method || "GET").toUpperCase() === "POST") {
        postCount += 1;
        const body = JSON.parse(options.body);
        postBodies.push(body);
        return { ok: true, json: async () => ({ ok: true, event: { id: 7, sender_label: body.senderLabel, message: "공지", created_at: "2026-08-01T00:00:00Z" } }) };
      }
      getCount += 1;
      return { ok: true, json: async () => ({ ok: true, admin: { id: "AD1", name: "관리자" }, chatMessages: [], systemEvents: [{ id: 5, message: "기본 기록", created_at: "2026-08-01T00:00:00Z" }, { id: 6, sender_label: "관제실", message: "기존 기록", created_at: "2026-08-01T00:00:01Z" }] }) };
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const window = { DAY1_DATA: { places: {} }, fetch: fetchImpl };
  const clock = createControlledClock();
  const browser = createBrowserContext({ clock, globals: { window, document, Element, console, fetch: fetchImpl, URLSearchParams } });
  const testSource = source.replace(/  window\.__BAEKJI_ADMIN_COMMUNICATIONS_MVP3__ = Object\.freeze\([\s\S]*?\n  mountRail\(\);\n  poll\(\);/, `  window.__BAEKJI_ADMIN_COMMUNICATIONS_MVP3__ = Object.freeze({ sessionScopeKey, targetOptions, previewRecipients, mergeRows });\n  window.__ADMIN_COMM_TEST__ = Object.freeze({ openSystemComposer, openSystemHistory, renderSystemComposer, poll });\n  return;`);
  assert.notEqual(testSource, source, "test must execute the actual communications module with only boot scheduling removed");
  loadScripts(browser.context, [{ source: testSource, filename: "admin-communications-mvp3.js" }]);
  return {
    modal, document, window, getCount: () => getCount, postCount: () => postCount, postBodies,
    api: window.__ADMIN_COMM_TEST__, timers, clock,
  };
}

const runtime = boot();
const originalFetch = runtime.window.fetch;
await runtime.api.poll();
assert.equal(runtime.getCount(), 1, "initial communications poll must issue one GET");
await runtime.api.openSystemComposer();
assert.equal(runtime.getCount(), 2, "fresh SYSTEM composer must fetch its snapshot exactly once");
const sender = runtime.modal.querySelector("[data-admin-system-sender]");
assert.ok(sender, "composer must directly render the sender input without a legacy decorator");
assert.equal(sender.value, "SYSTEM", "fresh SYSTEM composer must reset the sender to the exact default");

// The remaining assertions intentionally describe the direct-owner contract.
sender.value = "가".repeat(41); sender.emit("change");
assert.equal(sender.value.length, 40, "sender changes must enforce the exact 40-character maximum");
sender.value = "  안내\u0000 방송  "; sender.emit("change");
assert.equal(sender.value, "안내 방송", "sender field must sanitize controls, trim whitespace, and retain at most 40 characters");
runtime.modal.querySelector('[data-admin-system-kind="CHARACTER"]')?.emit("click");
assert.equal(runtime.modal.querySelector("[data-admin-system-target]")?.value, "a", "kind changes must select the active character target");
assert.equal(runtime.modal.querySelector("[data-admin-system-sender]")?.value, "안내 방송", "kind and target rerender must preserve the sanitized sender");
runtime.modal.querySelector("[data-admin-system-message]").value = "확인 메시지";
const review = runtime.modal.querySelector("[data-admin-system-review]");
assert.equal(review.disabled, false, "one active character must enable SYSTEM review");
review.emit("click");
assert.match(runtime.modal.innerHTML, /<span>발신<\/span><strong>안내 방송<\/strong>/, "confirmation must show the chosen sender label");
runtime.modal.querySelector("[data-admin-system-back]").emit("click");
assert.equal(runtime.modal.querySelector("[data-admin-system-sender]")?.value, "안내 방송", "confirm back must preserve the sender");
assert.equal(runtime.modal.querySelector("[data-admin-system-target]")?.value, "a", "confirm back must preserve the selected target");
assert.equal(runtime.modal.querySelector("[data-admin-system-message]")?.value, "확인 메시지", "confirm back must preserve the message");
runtime.modal.querySelector("[data-admin-system-review]").emit("click");
const confirm = runtime.modal.querySelector("[data-admin-system-confirm-send]");
confirm.emit("click"); confirm.invoke("click");
await Promise.resolve(); await Promise.resolve();
assert.equal(runtime.postCount(), 1, "duplicate confirmation clicks must produce exactly one POST");
assert.equal(runtime.postBodies[0].senderLabel, "안내 방송", "the one POST must carry the sanitized senderLabel");
assert.equal(runtime.window.fetch, originalFetch, "communications must never monkey-patch global fetch");
runtime.api.openSystemHistory();
assert.match(runtime.modal.innerHTML, /관제실/, "history must render event sender_label directly");
assert.match(runtime.modal.innerHTML, /SYSTEM/, "history must retain the default fallback for events with no sender_label");
assert.equal(runtime.getCount(), 2, "history uses already-polled events and must not add a GET");
runtime.document.dispatch("keydown", { key: "Escape" });
assert.equal(runtime.modal.childElementCount, 0, "Escape must still close the communications modal");

assert.doesNotMatch(source, /new MutationObserver|window\.fetch\s*=/, "direct communications ownership must not use observer or fetch interception");
assert.match(source, /data-admin-system-open/);
assert.match(source, /data-admin-system-history/);
assert.doesNotMatch(dashboard, /admin-system-sender-ui\.js/, "legacy sender decorator must not load");
assert.equal(fs.existsSync(legacyPath), false, "legacy sender decorator file must be removed");

console.log("PASS: communications directly owns sender state, confirmation, history, and one-shot SYSTEM delivery");
