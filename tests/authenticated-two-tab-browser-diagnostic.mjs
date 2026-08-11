import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const PROFILE_KEY = "baekji_city_tester_session_profile_v1";
const A = "cbdba7e3-3175-4d5d-b62b-9a942f9c1089";
const B = "853bb8fa-4dae-42c0-9d6a-5e5de4a84e82";
const C = "3c840f3b-700e-42fe-9483-2228daad257f";
const D = "6554b60a-be87-4c08-b8b5-8abda89faf5b";

const directory = [
  row(A, "테스트A", "data:image/jpeg;base64,QQ=="),
  row(B, "테스트B", "data:image/jpeg;base64,Qg=="),
  row(C, "테스트C", ""),
  row(D, "테스트D", ""),
];

function row(id, name, photo) {
  return { id, login_id: name, character_name: name, profile_photo: photo, is_active: true };
}
function character(id, party = null, session = null) {
  return { id, contamination: 0, symptom: "안정", inventory: {}, currentPartyId: party, currentSessionId: session, onlineAt: null };
}

const initialWorld = {
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  eventSeq: 0,
  sessionSeq: 3,
  characters: {
    [A]: character(A),
    [B]: character(B, "party_b", "session_b"),
    [C]: character(C, "party_cd", "session_cd"),
    [D]: character(D, "party_cd", "session_cd"),
  },
  parties: {
    party_b: { id: "party_b", name: "해오름역 조사조 3", status: "SESSION_CREATED", readyBy: [B], creatorId: B, memberIds: [B], sessionId: "session_b", invitedIds: [], confirmedBy: [B], declinedIds: [], destination: "E", flowRevision: 2, readyStateBy: { [B]: { at: 1, ready: true } }, compositionLockedAt: 1 },
    party_cd: { id: "party_cd", name: "해오름역 조사조 1", status: "SESSION_CREATED", readyBy: [C, D], creatorId: C, memberIds: [C, D], sessionId: "session_cd", invitedIds: [], confirmedBy: [C, D], declinedIds: [], destination: "E", flowRevision: 2, readyStateBy: { [C]: { at: 1, ready: true }, [D]: { at: 1, ready: true } }, compositionLockedAt: 1 },
  },
  sessions: {
    session_b: { id: "session_b", logs: [], status: "ACTIVE", endedAt: null, partyId: "party_b", variant: "c", movement: null, memberIds: [B], startedAt: 1, currentNode: "E_ENTRY", choiceReveal: { at: 1, type: "persistent-menu" }, takenItemKeys: [], activeEncounter: null, currentDetailId: null, inspectedObjectIds: [] },
    session_cd: { id: "session_cd", logs: [], status: "ACTIVE", endedAt: null, partyId: "party_cd", variant: "c", movement: null, memberIds: [C, D], startedAt: 1, currentNode: "E_ENTRY", choiceReveal: { at: 1, type: "persistent-menu" }, takenItemKeys: [], activeEncounter: null, currentDetailId: null, inspectedObjectIds: [] },
  },
  itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
  soundEvents: [],
};

const remote = {
  state: structuredClone(initialWorld),
  revision: 1,
  writer: "fixture",
  puts: 0,
  conflicts: 0,
  putLog: [],
};

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;
try {
  await waitForServer();
  const executablePath = findChrome();
  console.log("CHROME", executablePath);
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
    protocolTimeout: 12_000,
  });
  const context = await browser.createBrowserContext();

  const pageA = await context.newPage();
  await instrument(pageA, "A", directory[0]);
  await installInterception(pageA, "A");
  await pageA.goto(`${ORIGIN}/index.html#/home`, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await sleep(1800);
  const aBefore = await snapshot(pageA, "A-before-B");
  console.log("A_BEFORE_B", JSON.stringify(aBefore));
  assert.equal(aBefore.userId, A);
  assert.equal(aBefore.avatar, true, "A avatar should be present before B opens");

  const pageB = await context.newPage();
  await instrument(pageB, "B", null);
  await installInterception(pageB, "B");
  await pageB.goto(`${ORIGIN}/index.html#/login`, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await sleep(700);
  await pageB.type("[data-login-id]", "테스트B", { delay: 10 });
  await pageB.type("[data-login-password]", "1234", { delay: 10 });
  await pageB.click('[data-login-form] button[type="submit"]');
  await pageB.waitForFunction((key, id) => sessionStorage.getItem(key) === id && location.hash === "#/home", { timeout: 8_000 }, USER_KEY, B);
  await sleep(3500);

  const [aAfter, bAfter] = await Promise.allSettled([
    snapshot(pageA, "A-after-B-login"),
    snapshot(pageB, "B-after-login"),
  ]);
  console.log("REMOTE", JSON.stringify({ revision: remote.revision, puts: remote.puts, conflicts: remote.conflicts, putLog: remote.putLog.slice(-20) }));
  console.log("A_AFTER", JSON.stringify(aAfter));
  console.log("B_AFTER", JSON.stringify(bAfter));

  if (aAfter.status === "fulfilled") console.log("A_DIAG", JSON.stringify(aAfter.value.diag));
  if (bAfter.status === "fulfilled") console.log("B_DIAG", JSON.stringify(bAfter.value.diag));

  if (aAfter.status !== "fulfilled" || bAfter.status !== "fulfilled") {
    throw new Error(`renderer unresponsive after B login: A=${aAfter.status} B=${bAfter.status}`);
  }

  const a = aAfter.value;
  const b = bAfter.value;
  const clickA = await clickAndObserve(pageA, "[data-create-party]", 800);
  const clickB = await clickAndObserve(pageB, "[data-resume-session]", 800);
  console.log("CLICK_A", JSON.stringify(clickA));
  console.log("CLICK_B", JSON.stringify(clickB));

  assert.equal(a.avatar, true, "A avatar must remain after B login");
  assert.equal(b.avatar, true, "B avatar must remain after login");
  assert.ok(a.diag.appMutations < 20, `A app root churned ${a.diag.appMutations} times`);
  assert.ok(b.diag.appMutations < 20, `B app root churned ${b.diag.appMutations} times`);
  assert.ok(a.diag.storageEvents < 30, `A received ${a.diag.storageEvents} world storage events`);
  assert.ok(b.diag.storageEvents < 30, `B received ${b.diag.storageEvents} world storage events`);
  assert.ok(remote.puts < 25, `cloud writes ran away: ${remote.puts}`);
  assert.equal(clickA.changed || clickA.clicked === false, true, "A click should navigate when its control exists");
  assert.equal(clickB.changed, true, "B resume click should navigate");

  await context.close();
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill("SIGTERM");
}

function findChrome() {
  const candidates = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  try { return execFileSync("bash", ["-lc", "command -v google-chrome || command -v chromium || command -v chromium-browser"], { encoding: "utf8" }).trim(); }
  catch { throw new Error("Chrome/Chromium executable not found"); }
}

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try { const res = await fetch(`${ORIGIN}/index.html`); if (res.ok) return; } catch {}
    await sleep(100);
  }
  throw new Error("local static server failed to start");
}

async function instrument(page, label, profileRow) {
  page.on("console", (msg) => {
    const text = msg.text();
    if (/error|uncaught|rangeerror|maximum call/i.test(text)) console.log(`PAGE_${label}_CONSOLE`, text);
  });
  page.on("pageerror", (error) => console.log(`PAGE_${label}_ERROR`, String(error?.stack || error)));
  await page.evaluateOnNewDocument(({ GLOBAL_KEY, USER_KEY, PROFILE_KEY, label, profileRow }) => {
    window.__TAB_DIAG__ = {
      label,
      worldWrites: 0,
      writeSources: {},
      syntheticStorage: 0,
      syntheticSources: {},
      storageEvents: 0,
      trustedStorageEvents: 0,
      observerCallbacks: 0,
      observerSources: {},
      appMutations: 0,
      longTasks: 0,
      maxLongTask: 0,
    };
    const diag = window.__TAB_DIAG__;
    const sourceKey = (stack) => {
      const lines = String(stack || "").split("\n").slice(1);
      const useful = lines.find((line) => /\.js(?:\?|:)/.test(line) && !/authenticated-two-tab-browser-diagnostic/.test(line));
      return (useful || lines[0] || "unknown").trim().replace(/^at\s+/, "").slice(0, 180);
    };
    const nativeSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function diagnosticSetItem(key, value) {
      if (this === localStorage && String(key) === GLOBAL_KEY) {
        diag.worldWrites += 1;
        const source = sourceKey(new Error().stack);
        diag.writeSources[source] = (diag.writeSources[source] || 0) + 1;
      }
      return nativeSet.call(this, key, value);
    };
    const nativeDispatch = window.dispatchEvent;
    window.dispatchEvent = function diagnosticDispatch(event) {
      if (event?.type === "storage" && event?.key === GLOBAL_KEY) {
        diag.syntheticStorage += 1;
        const source = sourceKey(new Error().stack);
        diag.syntheticSources[source] = (diag.syntheticSources[source] || 0) + 1;
      }
      return nativeDispatch.call(this, event);
    };
    window.addEventListener("storage", (event) => {
      if (event?.key !== GLOBAL_KEY) return;
      diag.storageEvents += 1;
      if (event.isTrusted) diag.trustedStorageEvents += 1;
    }, true);

    const NativeMutationObserver = window.MutationObserver;
    window.MutationObserver = class DiagnosticMutationObserver extends NativeMutationObserver {
      constructor(callback) {
        const source = sourceKey(new Error().stack);
        super((records, observer) => {
          diag.observerCallbacks += 1;
          diag.observerSources[source] = (diag.observerSources[source] || 0) + 1;
          callback(records, observer);
        });
      }
    };
    document.addEventListener("DOMContentLoaded", () => {
      const app = document.getElementById("app");
      if (app) {
        new NativeMutationObserver((records) => { diag.appMutations += records.length; }).observe(app, { childList: true, subtree: false });
      }
    }, { once: true });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          diag.longTasks += 1;
          diag.maxLongTask = Math.max(diag.maxLongTask, entry.duration || 0);
        }
      }).observe({ entryTypes: ["longtask"] });
    } catch {}

    if (profileRow) {
      const name = String(profileRow.character_name || profileRow.login_id || "테스터");
      sessionStorage.setItem(USER_KEY, profileRow.id);
      sessionStorage.setItem(PROFILE_KEY, JSON.stringify({ id: profileRow.id, loginId: name, name, password: "", initial: Array.from(name)[0] || "?", note: "초대 테스터 계정", profilePhoto: profileRow.profile_photo || "", isTestOnly: true }));
    }
  }, { GLOBAL_KEY, USER_KEY, PROFILE_KEY, label, profileRow });
}

async function installInterception(page, label) {
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    const url = request.url();
    try {
      if (url.includes("supabase.co/rest/v1/rpc/baekji_tester_list_accounts")) return json(request, directory);
      if (url.includes("supabase.co/rest/v1/rpc/baekji_mvp_get_revision")) return json(request, remote.revision);
      if (url.includes("supabase.co/rest/v1/rpc/baekji_mvp_get_state")) return json(request, [{ state: structuredClone(remote.state), revision: remote.revision, writer_id: remote.writer }]);
      if (url.includes("supabase.co/rest/v1/rpc/baekji_mvp_put_state")) {
        const body = JSON.parse(request.postData() || "{}");
        remote.puts += 1;
        const expected = body.p_expected_revision == null ? null : Number(body.p_expected_revision);
        const accepted = expected == null || expected === remote.revision;
        remote.putLog.push({ label, expected, revision: remote.revision, accepted, writer: body.p_writer_id || "", chars: Object.keys(body.p_state?.characters || {}).length });
        if (!accepted) {
          remote.conflicts += 1;
          return json(request, [{ accepted: false, revision: remote.revision, state: structuredClone(remote.state) }]);
        }
        remote.state = structuredClone(body.p_state);
        remote.revision += 1;
        remote.writer = String(body.p_writer_id || label);
        return json(request, [{ accepted: true, revision: remote.revision, state: structuredClone(remote.state) }]);
      }
      if (url.startsWith(`${ORIGIN}/api/tester-login`)) {
        const body = JSON.parse(request.postData() || "{}");
        const normalized = String(body.loginId || "").replace(/\s+/g, "").toLowerCase();
        const user = directory.find((entry) => [entry.login_id, entry.character_name, entry.id].some((value) => String(value || "").replace(/\s+/g, "").toLowerCase() === normalized));
        return json(request, user ? { ok: true, user } : { ok: false, code: "INVALID_LOGIN" }, user ? 200 : 401);
      }
      if (url.startsWith(`${ORIGIN}/api/ai/status`)) return json(request, { available: false });
      if (url.startsWith(`${ORIGIN}/api/player-presence`)) return json(request, { ok: true });
      if (url.startsWith(`${ORIGIN}/api/player-admin-system`)) return json(request, { events: [] });
      return request.continue();
    } catch (error) {
      console.log("INTERCEPT_ERROR", label, url, String(error?.stack || error));
      try { return request.abort(); } catch {}
    }
  });
}

function json(request, payload, status = 200) {
  return request.respond({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload), headers: { "Access-Control-Allow-Origin": "*" } });
}

async function snapshot(page, label) {
  return await page.evaluate(({ USER_KEY, label }) => ({
    label,
    userId: sessionStorage.getItem(USER_KEY),
    hash: location.hash,
    avatar: Boolean(document.querySelector(".topbar-meta .tester-profile-avatar")),
    badge: document.querySelector(".topbar-meta .badge")?.textContent?.trim() || "",
    createParty: Boolean(document.querySelector("[data-create-party]")),
    resume: Boolean(document.querySelector("[data-resume-session]")),
    diag: structuredClone(window.__TAB_DIAG__),
  }), { USER_KEY, label });
}

async function clickAndObserve(page, selector, waitMs) {
  const before = await page.evaluate(() => location.hash);
  const exists = await page.$(selector);
  if (!exists) return { clicked: false, before, after: before, changed: false };
  await page.click(selector);
  await sleep(waitMs);
  const after = await page.evaluate(() => location.hash);
  return { clicked: true, before, after, changed: before !== after };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
