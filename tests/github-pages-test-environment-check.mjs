import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../github-pages-test-environment.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

const calls = [];
const sandbox = {
  window: {},
  globalThis: null,
  location: { hostname: "nam5an.github.io" },
  document: { documentElement: { dataset: {} } },
  fetch(input, init) {
    calls.push({ input, init });
    return Promise.resolve({ ok: true });
  },
  JSON,
  Object,
  String,
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "github-pages-test-environment.js" });

const api = sandbox.__BAEKJI_PAGES_TEST_ENV__;
assert.ok(api, "Pages test environment API must be exposed");
assert.equal(api.isGitHubPages, true);
assert.equal(api.TEST_STATE_KEY, "day1_world_pages_test");

await sandbox.fetch("https://example.supabase.co/rest/v1/rpc/baekji_mvp_get_state", {
  method: "POST",
  body: JSON.stringify({ p_state_key: "day1_world" }),
});
assert.equal(JSON.parse(calls[0].init.body).p_state_key, "day1_world_pages_test");
assert.equal(sandbox.document.documentElement.dataset.runtimeEnvironment, "github-pages-test");

assert.ok(
  html.indexOf("github-pages-test-environment.js") < html.indexOf("cloud-state-sync.js"),
  "Pages environment script must load before cloud sync",
);

console.log("PASS: GitHub Pages uses an isolated Supabase world state");
