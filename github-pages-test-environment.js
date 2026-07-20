(() => {
  "use strict";

  const PRODUCTION_STATE_KEY = "day1_world";
  const TEST_STATE_KEY = "day1_world_pages_test";
  const hostname = String(globalThis.location?.hostname || "").toLowerCase();
  const isGitHubPages = hostname === "github.io" || hostname.endsWith(".github.io");

  function rewriteRpcBody(body) {
    if (typeof body !== "string" || !body) return body;
    try {
      const payload = JSON.parse(body);
      if (payload?.p_state_key !== PRODUCTION_STATE_KEY) return body;
      return JSON.stringify({ ...payload, p_state_key: TEST_STATE_KEY });
    } catch {
      return body;
    }
  }

  const TEST_API = Object.freeze({
    PRODUCTION_STATE_KEY,
    TEST_STATE_KEY,
    isGitHubPages,
    rewriteRpcBody,
  });
  if (typeof window !== "undefined") window.__BAEKJI_PAGES_TEST_ENV__ = TEST_API;

  if (!isGitHubPages || typeof globalThis.fetch !== "function") return;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = function pagesTestFetch(input, init = undefined) {
    const url = typeof input === "string" ? input : String(input?.url || "");
    const isWorldStateRpc = /supabase\.co\/rest\/v1\/rpc\/baekji_mvp_(?:get_state|get_revision|put_state)/.test(url);
    if (!isWorldStateRpc) return originalFetch(input, init);
    return originalFetch(input, init ? { ...init, body: rewriteRpcBody(init.body) } : init);
  };

  if (typeof document !== "undefined") {
    document.documentElement.dataset.runtimeEnvironment = "github-pages-test";
  }
})();
