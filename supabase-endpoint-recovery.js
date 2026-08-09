(() => {
  "use strict";

  const LEGACY_SUPABASE_URL = "https://zstgpnwnwmeifgmyeqtz.supabase.co";
  const SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";

  if (typeof globalThis.fetch !== "function") return;

  const upstreamFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = function baekjiSupabaseRecoveryFetch(input, init = undefined) {
    const url = typeof input === "string" ? input : String(input?.url || "");
    if (!url.startsWith(`${LEGACY_SUPABASE_URL}/rest/v1/`)) {
      return upstreamFetch(input, init);
    }

    const nextUrl = `${SUPABASE_URL}${url.slice(LEGACY_SUPABASE_URL.length)}`;
    const headers = new Headers(init?.headers || (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
    headers.set("apikey", SUPABASE_KEY);
    headers.delete("Authorization");

    return upstreamFetch(nextUrl, {
      ...init,
      headers,
    });
  };

  if (typeof window !== "undefined") {
    window.__BAEKJI_SUPABASE_RECOVERY__ = Object.freeze({
      legacyUrl: LEGACY_SUPABASE_URL,
      url: SUPABASE_URL,
    });
  }
})();
