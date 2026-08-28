import fs from "node:fs";

const mode = process.argv[2] || "all";
const testerPath = new URL("../tester-auth.js", import.meta.url);
const source = fs.readFileSync(testerPath, "utf8");
const url = source.match(/const SUPABASE_URL = "([^"]+)"/)?.[1];
const key = source.match(/const SUPABASE_KEY = "([^"]+)"/)?.[1];

if (!url || !key) throw new Error("tester-auth Supabase configuration not found");

async function rpc(name, body) {
  try {
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
    console.log(name, "HTTP", response.status, JSON.stringify(payload));
    return { status: response.status, ok: response.ok, payload, networkError: false };
  } catch (error) {
    const detail = `${error?.name || "Error"}: ${error?.message || String(error)}${error?.cause?.code ? ` (${error.cause.code})` : ""}`;
    console.log(name, "NETWORK_ERROR", detail);
    return { status: 0, ok: false, payload: { message: detail, code: error?.cause?.code || "NETWORK_ERROR" }, networkError: true };
  }
}

function classify(result) {
  const message = String(result.payload?.message || result.payload || "");
  const code = String(result.payload?.code || "");
  if (result.networkError) {
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|name resolution/i.test(`${code} ${message}`)) return "DNS_ERROR";
    return "NETWORK_ERROR";
  }
  if (result.status === 401 || /invalid api key/i.test(message)) return "INVALID_API_KEY";
  if (/jwt/i.test(message)) return "JWT_ERROR";
  if (result.status === 403 || /permission denied|not allowed|insufficient privilege/i.test(message)) return "PERMISSION_DENIED";
  if (code === "PGRST202" || /function .* could not be found/i.test(message)) return "MISSING_FUNCTION";
  if (result.status === 404) return "HTTP_404";
  if (result.ok) return "OK";
  return `HTTP_${result.status}`;
}

function writeOutput(name, value) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  fs.appendFileSync(output, `${name}=${String(value).replace(/\r?\n/g, " ")}\n`);
}

async function probeLogin() {
  const login = await rpc("baekji_tester_login", {
    p_character_name: `__ci_missing_${Date.now()}__`,
    p_pin: "0000",
  });
  writeOutput("status", login.status);
  writeOutput("category", classify(login));
  writeOutput("code", login.payload?.code || "");
  writeOutput("message", String(login.payload?.message || login.payload || "").slice(0, 240));
  return login;
}

async function checkLogin() {
  const login = await probeLogin();
  if (!login.ok) throw new Error(`tester login RPC unreachable: HTTP ${login.status} ${JSON.stringify(login.payload)}`);
  if (!Array.isArray(login.payload)) throw new Error(`tester login RPC returned unexpected payload: ${JSON.stringify(login.payload)}`);
  console.log("PASS: live tester login RPC is reachable");
}

async function checkSignup() {
  const signup = await rpc("baekji_tester_signup", {
    p_character_name: "CI진단계정",
    p_pin: "12",
    p_profile_photo: "data:image/jpeg;base64,AA==",
  });
  if (signup.ok) throw new Error("tester signup accepted an invalid PIN; probe should not create an account");
  const message = String(signup.payload?.message || signup.payload || "");
  if (!message.includes("INVALID_PIN")) {
    throw new Error(`tester signup RPC failed before validation: HTTP ${signup.status} ${JSON.stringify(signup.payload)}`);
  }
  console.log("PASS: live tester signup RPC reaches validation");
}

async function checkCloud() {
  const keyName = `__ci_missing_state_${Date.now()}__`;
  const revision = await rpc("baekji_mvp_get_revision", { p_state_key: keyName });
  const state = await rpc("baekji_mvp_get_state", { p_state_key: keyName });
  for (const [name, probe] of [["baekji_mvp_get_revision", revision], ["baekji_mvp_get_state", state]]) {
    const message = String(probe.payload?.message || probe.payload || "");
    const denied = [401, 403].includes(probe.status)
      && (String(probe.payload?.code || "") === "42501" || /permission denied|insufficient privilege/i.test(message));
    if (!denied) {
      throw new Error(`${name} must stay revoked from the publishable browser role: HTTP ${probe.status} ${JSON.stringify(probe.payload)}`);
    }
  }
  console.log("PASS: live legacy whole-world read RPCs remain revoked from the publishable browser role");
}

if (mode === "probe-login") await probeLogin();
else if (mode === "login") await checkLogin();
else if (mode === "signup") await checkSignup();
else if (mode === "cloud") await checkCloud();
else { await checkLogin(); await checkSignup(); await checkCloud(); }
