import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("tester-party-profile-sync.js", "utf8");
const css = fs.readFileSync("tester-party-profile-sync.css", "utf8");
const mobileCss = fs.readFileSync("mobile-topbar-compact.css", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");

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

assert(app.includes("briefing-member-main"), "briefing member names should render directly");
assert(app.includes('partyAvatarMarkup(account, "tester-briefing-avatar")'), "briefing member profile photos should render directly");
assert(!source.includes("decorateBriefingMembers"), "profile sync must not rewrite direct briefing rows");
assert(source.includes("decorateInviteCandidates"), "party profile sync may hydrate a tester directory entry that arrived after app first paint");
assert(!source.includes("document.createElement") && !source.includes(".prepend(") && !source.includes("replaceWith("), "party profile sync must not create or replace app-rendered invite DOM");
assert(app.includes('data-tester-account-id="${escapeHtml(u.id)}"'), "app must own candidate tester ids directly");
assert(app.includes('class="retro-invite-profile"'), "app must render candidate profile image markup directly");
assert(css.includes("object-fit: cover"), "briefing profile photos should fill the avatar frame");
assert(mobileCss.includes("body.mobile-investigation-active .topbar"), "mobile investigation topbar should be compacted");
assert(mobileCss.includes("writing-mode: horizontal-tb"), "mobile topbar labels must remain horizontal");
assert(mobileCss.includes("content: \"지도\""), "mobile map action should use a short label");
assert(mobileCss.includes("content: \"나가기\""), "mobile logout action should use a short label");
assert(index.includes("tester-party-profile-sync.js?v=0.3.65"), "tester party profile sync cache key must include direct briefing ownership");
assert.match(index, /party-flow-sync\.js\?v=0\.3\.69&stage3a=1&stage6b=1&stage8b-b5=1/, "party flow cache key must include direct briefing ownership");
assert(index.includes("mobile-topbar-compact.css?v=0.3.56"), "mobile topbar fix must be loaded");

console.log("PASS: tester briefing/invite photos and compact mobile topbar");
