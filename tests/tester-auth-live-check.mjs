import fs from "node:fs";

const source = fs.readFileSync(new URL("../tester-auth.js", import.meta.url), "utf8");
const url = source.match(/const SUPABASE_URL = "([^"]+)"/)?.[1];
const key = source.match(/const SUPABASE_KEY = "([^"]+)"/)?.[1];

if (!url || !key) throw new Error("tester-auth Supabase configuration not found");

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
  throw new Error(`tester login RPC unreachable: HTTP ${login.status} ${JSON.stringify(login.payload)}`);
}
if (!Array.isArray(login.payload)) {
  throw new Error(`tester login RPC returned unexpected payload: ${JSON.stringify(login.payload)}`);
}

const signup = await rpc("baekji_tester_signup", {
  p_character_name: "CI진단계정",
  p_pin: "12",
  p_profile_photo: "data:image/jpeg;base64,AA==",
});
console.log("SIGNUP_INVALID_PIN_PROBE", JSON.stringify(signup));
if (signup.ok) {
  throw new Error("tester signup accepted an invalid PIN; probe should not create an account");
}
const message = String(signup.payload?.message || signup.payload || "");
if (!message.includes("INVALID_PIN")) {
  throw new Error(`tester signup RPC failed before validation: HTTP ${signup.status} ${JSON.stringify(signup.payload)}`);
}

console.log("PASS: live tester auth RPC is reachable and signup validation executes");
