const SUPABASE_URL = process.env.SUPABASE_URL || "https://kfgtvifupumjuewwxzmz.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const LEGACY_LOGIN_ALIASES = new Map([
  ["캐릭터a", "테스트 캐릭터 A"],
  ["캐릭터b", "테스트 캐릭터 B"],
  ["캐릭터c", "테스트 캐릭터 C"],
]);

function normalize(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function loginQueryName(value) {
  const raw = String(value || "").trim();
  return LEGACY_LOGIN_ALIASES.get(normalize(raw)) || raw;
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const characterName = loginQueryName(req.body?.characterName);
  const pin = String(req.body?.pin || "");
  if (!characterName || characterName.length > 40 || !/^\d{4}$/.test(pin)) {
    return send(res, 401, { ok: false, error: "INVALID_CREDENTIALS" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/baekji_tester_login`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_character_name: characterName, p_pin: pin }),
      cache: "no-store",
      signal: controller.signal,
    });

    const rows = await response.json().catch(() => []);
    if (!response.ok) {
      console.error("[tester-login] supabase response", response.status);
      return send(res, 503, { ok: false, error: "AUTH_BACKEND_UNAVAILABLE" });
    }
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id) return send(res, 401, { ok: false, error: "INVALID_CREDENTIALS" });

    return send(res, 200, {
      ok: true,
      user: {
        id: String(row.id),
        characterName: String(row.character_name || characterName),
        profilePhoto: String(row.profile_photo || ""),
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") return send(res, 504, { ok: false, error: "AUTH_BACKEND_TIMEOUT" });
    console.error("[tester-login] request failed", error?.message || error);
    return send(res, 503, { ok: false, error: "AUTH_BACKEND_UNAVAILABLE" });
  } finally {
    clearTimeout(timeout);
  }
}

export const __TEST__ = Object.freeze({ normalize, loginQueryName });
