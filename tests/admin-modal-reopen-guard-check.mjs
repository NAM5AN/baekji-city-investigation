import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("admin-dashboard.html", "utf8");
const source = fs.readFileSync("admin-shell-runtime.js", "utf8");

assert.doesNotMatch(html, /admin-modal-reopen-guard\.js/, "legacy reopen guard must not compete with the shell modal owner");
assert.ok(html.indexOf("admin-shell-runtime.js") < html.indexOf("admin-observation-mvp2.js"));

class Element {
  constructor(dataset = {}) { this.dataset = dataset; this.innerHTML = ""; this.classList = { toggle() {} }; }
  get childElementCount() { return this.innerHTML ? 1 : 0; }
  replaceChildren() { this.innerHTML = ""; }
  closest(selector) { return selector === "[data-admin-modal-close]" && this.dataset.adminModalClose !== undefined ? this : null; }
  matches(selector) { return selector === "[data-admin-modal-backdrop]" && this.dataset.adminModalBackdrop !== undefined; }
}
const root = new Element();
const windowListeners = [];
const context = {
  Element, console, Object, Array, String, Number, Boolean, Set, Map, JSON, Promise,
  window: { addEventListener(type, handler, capture) { windowListeners.push({ type, handler, capture }); } },
  document: {
    getElementById(id) { return id === "admin-modal-root" ? root : null; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
  },
  fetch: async () => ({ ok: true, json: async () => ({ ok: true, state: {} }) }),
  setTimeout: () => 1,
  clearTimeout() {},
};
context.globalThis = context;
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context, { filename: "admin-shell-runtime.js" });
const shell = context.window.__BAEKJI_ADMIN_SHELL__;

shell.modal.render("observation", "<section>observe</section>");
assert.equal(shell.modal.getOwner(), "observation");
assert.equal(shell.modal.clear("dashboard"), false, "wrong owner cannot close an observation modal");
assert.match(root.innerHTML, /observe/);
const close = windowListeners.find((entry) => entry.type === "click" && entry.capture);
close.handler({ target: new Element({ adminModalClose: "" }), preventDefault() {} });
assert.equal(shell.modal.getOwner(), "", "the one shell close owner clears the modal");
assert.equal(root.innerHTML, "");

console.log("PASS: modal close ownership moved from the reopen guard into the shared admin shell");
