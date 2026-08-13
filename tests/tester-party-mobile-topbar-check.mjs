import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("tester-party-profile-sync.js", "utf8");
const css = fs.readFileSync("tester-party-profile-sync.css", "utf8");
const mobileCss = fs.readFileSync("mobile-topbar-compact.css", "utf8");
const index = fs.readFileSync("index.html", "utf8");

const testerId = "tester_52477839f165418784aba32db0";
const profilePhoto = "data:image/jpeg;base64,AA==";
const context = vm.createContext({
  console,
  queueMicrotask,
  setTimeout,
  clearTimeout,
  document: {
    documentElement: {},
    querySelectorAll() { return []; },
    createElement() { return { className: "", src: "", alt: "" }; },
  },
  MutationObserver: class { observe() {} },
  fetch: async () => ({
    ok: true,
    status: 200,
    async json() {
      return [{
        id: testerId,
        character_name: "테",
        profile_photo: profilePhoto,
      }];
    },
  }),
});
context.window = context;
context.window.addEventListener = () => {};

vm.runInContext(source, context, { filename: "tester-party-profile-sync.js" });
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

const api = context.__BAEKJI_TESTER_PARTY_PROFILE_TEST__;
assert(api, "tester party profile test API should be available");
const parsed = api.accountFromRow({ id: testerId, character_name: "테", profile_photo: profilePhoto });
assert.equal(parsed.name, "테");
assert.equal(parsed.profilePhoto, profilePhoto, "tester directory should preserve the stored profile photo");
assert.equal(api.replaceAccountIds(`${testerId}의 확인을 기다리고 있습니다.`), "테의 확인을 기다리고 있습니다.");

assert(source.includes(".briefing-member-main strong"), "briefing member names should be decorated");
assert(source.includes("tester-briefing-avatar"), "briefing member profile photos should be rendered");
assert(source.includes("decorateInviteCandidates"), "party invite candidates should be decorated with tester directory data");
assert(source.includes(".retro-invite-card"), "invite grid cards should be scanned for tester accounts");
assert(source.includes(".retro-invite-profile"), "generated invite placeholders should be replaced by stored tester photos");
assert(source.includes("dataset.testerProfilePhoto"), "real tester photos should be marked after replacing placeholders");
assert(css.includes("object-fit: cover"), "briefing profile photos should fill the avatar frame");
assert(mobileCss.includes("body.mobile-investigation-active .topbar"), "mobile investigation topbar should be compacted");
assert(mobileCss.includes("writing-mode: horizontal-tb"), "mobile topbar labels must remain horizontal");
assert(mobileCss.includes("content: \"지도\""), "mobile map action should use a short label");
assert(mobileCss.includes("content: \"나가기\""), "mobile logout action should use a short label");
assert(index.includes("tester-party-profile-sync.js?v=0.3.64"), "tester party profile sync cache key must include the invite photo fix");
assert(index.includes("party-flow-sync.js?v=0.3.63"), "party flow cache key must include the global invite popup fix");
assert(index.includes("mobile-topbar-compact.css?v=0.3.56"), "mobile topbar fix must be loaded");

console.log("PASS: tester briefing/invite photos and compact mobile topbar");
