import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("admin-modal-reopen-guard.js", "utf8");
const html = fs.readFileSync("admin-dashboard.html", "utf8");

class FakeElement {
  constructor(kind = "root") {
    this.kind = kind;
    this.dataset = {};
    this._html = "";
  }
  replaceChildren() { this._html = ""; }
  querySelector(selector) {
    if (selector === ".admin-observe-modal" && this._html.includes("admin-observe-modal")) return {};
    return null;
  }
  closest(selector) {
    if (this.kind === "close" && selector.includes("[data-admin-modal-close]")) return this;
    if (this.kind === "detail" && selector.includes("[data-admin-detail]")) return this;
    if (this.kind === "launch" && selector.includes("[data-admin-observe-launch]")) return this;
    return null;
  }
  matches(selector) {
    return this.kind === "backdrop" && selector === "[data-admin-modal-backdrop]";
  }
}
Object.defineProperty(FakeElement.prototype, "innerHTML", {
  configurable: true,
  get() { return this._html; },
  set(value) { this._html = String(value ?? ""); },
});

const root = new FakeElement();
const listeners = new Map();
const context = vm.createContext({
  console,
  Element: FakeElement,
  document: {
    getElementById(id) { return id === "admin-modal-root" ? root : null; },
  },
});
context.window = context;
context.addEventListener = (type, handler) => {
  const list = listeners.get(type) || [];
  list.push(handler);
  listeners.set(type, list);
};

vm.runInContext(source, context, { filename: "admin-modal-reopen-guard.js" });
const fire = (type, event) => (listeners.get(type) || []).forEach((handler) => handler(event));

assert.match(html, /admin-observation-mvp2\.js\?v=0\.2\.0[\s\S]*admin-modal-reopen-guard\.js\?v=0\.5\.3/);
assert.equal(context.__BAEKJI_ADMIN_MODAL_REOPEN_GUARD__.isSuppressed(), false);

root.innerHTML = '<section class="admin-modal admin-observe-modal"></section>';
assert.match(root.innerHTML, /admin-observe-modal/);
fire("click", { target: new FakeElement("close") });
assert.equal(root.innerHTML, "", "closing an observation modal must clear the visible modal");
assert.equal(context.__BAEKJI_ADMIN_MODAL_REOPEN_GUARD__.isSuppressed(), true);

root.innerHTML = '<section class="admin-modal admin-observe-modal">poll refresh</section>';
assert.equal(root.innerHTML, "", "snapshot polling must not resurrect a modal the administrator closed");

root.innerHTML = '<section class="admin-modal">other admin modal</section>';
assert.match(root.innerHTML, /other admin modal/, "unrelated admin modals must remain available");

fire("click", { target: new FakeElement("detail") });
assert.equal(context.__BAEKJI_ADMIN_MODAL_REOPEN_GUARD__.isSuppressed(), false, "an explicit detail click must re-enable observation modals");
root.innerHTML = '<section class="admin-modal admin-observe-modal">explicit reopen</section>';
assert.match(root.innerHTML, /explicit reopen/);

fire("keydown", { key: "Escape" });
assert.equal(root.innerHTML, "", "Escape must close and suppress the active observation modal");
root.innerHTML = '<section class="admin-modal admin-observe-modal">poll refresh 2</section>';
assert.equal(root.innerHTML, "");

console.log("PASS: closed admin observation modals stay closed across CONTROL snapshot polling and reopen only on explicit user action");
