import fs from "node:fs";

const source = fs.readFileSync(new URL("../tester-auth.js", import.meta.url), "utf8");
const url = source.match(/const SUPABASE_URL = "([^"]+)"/)?.[1];
const key = source.match(/const SUPABASE_KEY = "([^"]+)"/)?.[1];

function fail(title, detail) {
  const safe = String(detail).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  console.error(`::error title=${title}::${safe}`);
  throw new Error(detail);
}

if (!url || !key) fail("tester-auth config", "tester-auth Supabase configuration not found");

async function rpc(name, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, ok: response.ok, payload };
}

const login = await rpc("baekji_tester_login", {
  p_character_name: `__ci_missing_${Date.now()}__`,
  p_pin: "0000",
});
console.log("LOGIN_PROBE", JSON.stringify(login));
if (!login.ok) {
  fail("tester login RPC probe", `HTTP ${login.status} ${JSON.stringify(login.payload)}`);
}
if (!Array.isArray(login.payload)) {
  fail("tester login RPC payload", JSON.stringify(login.payload));
}

const signup = await rpc("baekji_tester_signup", {
  p_character_name: "CI진단계정",
  p_pin: "12",
  p_profile_photo: "data:image/jpeg;base64,AA==",
});
console.log("SIGNUP_INVALID_PIN_PROBE", JSON.stringify(signup));
if (signup.ok) {
  fail("tester signup validation", "signup accepted an invalid PIN; probe should not create an account");
}
const message = String(signup.payload?.message || signup.payload || "");
if (!message.includes("INVALID_PIN")) {
  fail("tester signup RPC probe", `HTTP ${signup.status} ${JSON.stringify(signup.payload)}`);
}

console.log("PASS: live tester auth RPC is reachable and signup validation executes");
