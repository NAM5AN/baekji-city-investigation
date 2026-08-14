import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync("app.js", "utf8");
const auth = fs.readFileSync("tester-auth.js", "utf8");
const profileSync = fs.readFileSync("tester-party-profile-sync.js", "utf8");
const visual = fs.readFileSync("investigation-visual-polish.js", "utf8");
const css = fs.readFileSync("investigation-visual-polish.css", "utf8");
const homeCss = fs.readFileSync("party-member-home-roster.css", "utf8");
const partyFlowCss = fs.readFileSync("party-flow-sync.css", "utf8");
const index = fs.readFileSync("index.html", "utf8");

const memberRowStart = app.indexOf("  function memberRow(");
const memberRowEnd = app.indexOf("  function inviteUser(", memberRowStart);
const homeRowStart = app.indexOf("  function partyHomeMemberMarkup(");
const homeRowEnd = app.indexOf("  function setCurrentUser(", homeRowStart);
assert.ok(memberRowStart >= 0 && memberRowEnd > memberRowStart, "party member and pending markup must be discoverable");
assert.ok(homeRowStart >= 0 && homeRowEnd > homeRowStart, "home member markup must be discoverable");
const memberRows = app.slice(memberRowStart, memberRowEnd);
const homeRow = app.slice(homeRowStart, homeRowEnd);

assert.match(app, /function partyAvatarMarkup\(account, imageClass\)[\s\S]*?class="\$\{imageClass\}"/, "profile-aware avatar markup must be emitted by the first app render");
assert.match(memberRows, /member-avatar \$\{u\.profilePhoto \? "has-profile-photo" : ""\}/, "joined rows must have the profile size class before paint");
assert.match(memberRows, /member-avatar \$\{account\.profilePhoto \? "has-profile-photo" : ""\}/, "pending rows must have the profile size class before paint");
assert.match(homeRow, /member-avatar \$\{account\.profilePhoto \? "has-profile-photo" : ""\}/, "home rows must have the profile size class before paint");
assert.match(homeRow, /partyAvatarMarkup\(account, "tester-member-avatar party-member-home-avatar-image"\)/, "home image must retain its scoped avatar class alongside tester-member-avatar");
assert.match(memberRows, /partyAvatarMarkup\(u, "tester-member-avatar party-member-home-avatar-image"\)/, "joined image must have the stable tester avatar class on first paint");
assert.match(memberRows, /partyAvatarMarkup\(account, "tester-member-avatar party-member-home-avatar-image"\)/, "pending image must have the stable tester avatar class on first paint");
assert.match(app, /retro-invite-grid/, "invite candidates must render the grid class directly");
assert.match(app, /retro-invite-card" data-tester-account-id=/, "each candidate must own its tester account id on first paint");
assert.match(app, /<img class="retro-invite-profile" src="\$\{escapeHtml\(u\.profilePhoto \|\| "assets\/no-image-placeholder\.svg\?v=2"\)\}/, "candidate markup must directly render both the stored photo and no-image placeholder");
assert.match(app, /data-invite="\$\{u\.id\}"/, "invite actions must remain in the direct grid markup");

// Departure confirmation reuses the invite-modal shell, but its two actions
// have different layout needs. Keep that scope explicit so ordinary invite
// flows remain on their existing three-column desktop contract.
const departureModalStart = app.indexOf("  function showDepartureModal(");
const departureModalEnd = app.indexOf("  function commitForcedDeparture(", departureModalStart);
assert.ok(departureModalStart >= 0 && departureModalEnd > departureModalStart, "guarded departure modal markup must stay discoverable");
const departureModal = app.slice(departureModalStart, departureModalEnd);
assert.match(departureModal, /class="retro-invite-actions retro-departure-actions"/, "departure confirmation must opt into its dedicated actions class without replacing the shared modal class");
assert.match(departureModal, /<button[^>]*class="button"[^>]*data-party-departure-cancel[^>]*>[^<]+<\/button>[\s\S]*?<button[^>]*class="button primary"[^>]*data-party-departure-confirm=/, "departure markup must retain exactly the secondary and primary action buttons in order");

assert.doesNotMatch(visual, /function profileDataUri|function decorateInviteGrid|retro-invite-card/, "visual polish must not create or decorate invite DOM after paint");
assert.match(profileSync, /function decorateInviteCandidates/, "profile sync may hydrate a late tester directory record without owning invite structure");
assert.doesNotMatch(profileSync, /document\.createElement|\.prepend\(|replaceWith\(|\.innerHTML\s*=/, "profile sync must never create or replace invite DOM structure");

assert.match(css, /\.retro-invite-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, "desktop invite grid must be three columns");
assert.match(css, /\.retro-invite-grid\s*\{[\s\S]*?gap:\s*14px[\s\S]*?grid-auto-rows:\s*104px[\s\S]*?max-height:\s*calc\(104px \* 4 \+ 14px \* 3\)/, "invite grid must cap its viewport at exactly four desktop rows");
assert.match(css, /\.retro-invite-grid\s*\{[\s\S]*?overflow-y:\s*auto/, "the capped grid must scroll only when it exceeds four rows");
assert.match(css, /\.retro-invite-grid::-webkit-scrollbar-button\s*\{[\s\S]*?width:\s*0[\s\S]*?height:\s*0/, "WebKit scroll arrows must be hidden without changing grid geometry");
assert.match(css, /\.retro-invite-grid::-webkit-scrollbar-thumb/, "WebKit scrollbar thumb needs scoped styling");
assert.match(css, /\.retro-invite-grid::-webkit-scrollbar-track/, "WebKit scrollbar track needs scoped styling");
assert.match(css, /scrollbar-width:\s*thin/, "Firefox scrollbar width must be scoped to the grid");
assert.match(css, /scrollbar-color:/, "Firefox scrollbar colors must be scoped to the grid");
assert.match(css, /@media\s*\(max-width:\s*[^)]*\)\s*\{[\s\S]*?\.retro-invite-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/, "tablet layout must reduce the invite grid to two columns");
assert.match(css, /@media\s*\(max-width:\s*[^)]*\)\s*\{[\s\S]*?\.retro-invite-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/, "phone layout must reduce the invite grid to one column");
assert.match(homeCss, /party-member-home-row \.member-avatar\{[^}]*border:1px solid currentColor[^}]*box-sizing:border-box[^}]*overflow:hidden/, "home avatar frame must remain square, clipped, and border-box sized");
assert.match(homeCss, /party-member-home-avatar-image\{[^}]*object-fit:cover/, "home avatar image must crop rather than alter row dimensions");
assert.match(partyFlowCss, /\.retro-invite-actions\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*1fr\s+1fr\s+1\.2fr;/, "shared invite actions must retain their three-column desktop contract");
assert.match(partyFlowCss, /\.retro-departure-actions\s*\{\s*width:\s*100%;\s*grid-template-columns:\s*minmax\(0,\s*0\.8fr\)\s+minmax\(0,\s*1\.35fr\);/, "desktop departure actions must use two columns with a wider primary action");
assert.match(partyFlowCss, /\.retro-departure-actions\s*>\s*\.button\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*46px;/, "both departure actions must have equal minimum height and fill their columns");
assert.match(partyFlowCss, /\.retro-departure-actions\s*>\s*\.button\.primary\s*\{\s*white-space:\s*nowrap;/, "the primary departure action label must not wrap");
assert.match(partyFlowCss, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.retro-departure-actions\s*\{\s*grid-template-columns:\s*1fr;/, "phone departure actions must stack into one column at 640px or below");
assert.match(index, /app\.js\?v=0\.4\.6[^"']*party-invite-grid-stability=1/, "app cache key must identify the first-paint invite grid implementation");
assert.match(index, /investigation-visual-polish\.css\?v=0\.3\.52/);
assert.match(index, /investigation-visual-polish\.js\?v=0\.3\.53/);
assert.match(index, /party-member-home-roster\.css\?v=0\.3\.94/);
assert.match(index, /party-flow-sync\.css\?v=0\.3\.20/, "departure action CSS cache key must advance with the layout change");

class FakeImage {
  constructor(src = "") { this.src = src; this.className = "tester-member-avatar party-member-home-avatar-image"; this.alt = ""; }
}
class FakeAvatar {
  constructor(image = null, text = "A") {
    this.image = image;
    this._text = text;
    this.appendCount = 0;
    this.classList = { add: () => {} };
  }
  querySelector(selector) { return selector === ".tester-member-avatar" ? this.image : null; }
  append(image) { this.image = image; this.appendCount += 1; }
  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value); }
}
function fakeMember(name, avatar) {
  return { querySelector(selector) { return selector === ".list-title" ? { textContent: name } : selector === ".member-avatar" ? avatar : null; } };
}

const photoUrl = "data:image/jpeg;base64,AA==";
const existingImage = new FakeImage(photoUrl);
const photoAvatar = new FakeAvatar(existingImage);
const initialAvatar = new FakeAvatar(null, "N");
const authDocument = {
  documentElement: {},
  querySelectorAll(selector) { return selector === ".member" ? [fakeMember("Photo User", photoAvatar), fakeMember("No Photo", initialAvatar)] : []; },
  createElement() { return new FakeImage(); },
};
let authRuntime = auth.replace('  new MutationObserver(scheduleRefresh).observe(document.documentElement, { childList: true, subtree: true });', '  window.__PARTY_INVITE_GRID_AUTH_TEST__ = { install, decorateMembers }; return;\n  new MutationObserver(scheduleRefresh).observe(document.documentElement, { childList: true, subtree: true });');
const authContext = vm.createContext({
  window: {}, document: authDocument, console, Map, Set, Array, Object, String, Number, JSON,
  sessionStorage: { getItem() { return ""; } }, localStorage: { getItem() { return null; }, setItem() {} },
  MutationObserver: class { observe() {} }, setTimeout() { return 0; }, setInterval() { return 0; },
});
authContext.window = authContext;
vm.runInContext(authRuntime, authContext, { filename: "tester-auth.js" });
const authApi = authContext.__PARTY_INVITE_GRID_AUTH_TEST__;
assert.ok(authApi, "tester-auth decorateMembers seam must execute in the VM");
authApi.install({ id: "photo", name: "Photo User", profilePhoto: photoUrl });
authApi.install({ id: "initial", name: "No Photo", profilePhoto: "" });
authApi.decorateMembers();
assert.equal(photoAvatar.image, existingImage, "tester-auth must preserve an app-rendered profile img object when its src already matches");
assert.equal(photoAvatar.appendCount, 0, "tester-auth must not append or replace an already-correct first-paint profile image");
assert.equal(photoAvatar.image.src, photoUrl);
assert.equal(initialAvatar.image, null, "no-photo avatar must keep its initial character instead of creating an image");
assert.equal(initialAvatar.textContent, "N");

let inviteSrcWrites = 0;
const inviteImage = {
  src: photoUrl,
  alt: "Photo User profile",
  dataset: {},
  getAttribute(name) { return name === "src" ? this.src : null; },
  set src(value) { inviteSrcWrites += 1; this._src = value; },
  get src() { return this._src; },
};
inviteImage._src = photoUrl;
const inviteName = { textContent: "Photo User" };
const inviteCard = {
  dataset: { testerAccountId: "photo" },
  querySelector(selector) { return selector === ".list-title" ? inviteName : selector === ":scope > .retro-invite-profile" ? inviteImage : null; },
};
const profileSyncContext = vm.createContext({
  window: {}, console, Map, Array, String, Object, Promise, queueMicrotask,
  document: { documentElement: {}, querySelectorAll(selector) { return selector === ".retro-invite-card" ? [inviteCard] : []; } },
  MutationObserver: class { observe() {} },
  fetch: async () => ({ ok: true, async json() { return [{ id: "photo", character_name: "Photo User", profile_photo: photoUrl }]; } }),
});
profileSyncContext.window = profileSyncContext;
profileSyncContext.window.addEventListener = () => {};
vm.runInContext(profileSync, profileSyncContext, { filename: "tester-party-profile-sync.js" });
await Promise.resolve();
await Promise.resolve();
assert.equal(inviteSrcWrites, 0, "late-directory invite hydration must not reassign an already-correct first-paint src");
assert.equal(inviteCard.querySelector(":scope > .retro-invite-profile"), inviteImage, "profile sync must preserve the app-rendered invite image object");

console.log("PASS: first-paint party avatars and invite grid stay stable across profile decoration and large candidate lists");
