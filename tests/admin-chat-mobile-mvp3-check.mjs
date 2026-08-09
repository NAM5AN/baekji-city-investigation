import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const js = await readFile(new URL("../admin-chat-mobile-mvp3.js", import.meta.url), "utf8");
const css = await readFile(new URL("../admin-chat-mobile-mvp3.css", import.meta.url), "utf8");

assert.match(html, /admin-chat-mobile-mvp3\.css\?v=0\.3\.1/);
assert.match(html, /admin-chat-mobile-mvp3\.js\?v=0\.3\.1/);
assert.match(js, /max-width: 760px/);
assert.match(js, /admin-chat-mobile-open/);
assert.match(js, /관리자 채팅/);
assert.match(js, /채팅 닫기/);
assert.match(js, /aria-expanded/);
assert.match(css, /\.admin-chat-rail\{display:grid!important;position:fixed/);
assert.match(css, /body\.admin-chat-mobile-open \.admin-chat-rail/);
assert.match(css, /\.admin-chat-mobile-toggle\{display:block;position:fixed/);
assert.match(css, /safe-area-inset-bottom/);
assert.match(css, /prefers-reduced-motion/);

console.log("PASS: mobile administrators can open the persistent chat drawer without leaving the observation dashboard");
