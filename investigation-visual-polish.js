(() => {
  "use strict";

  const app = document.getElementById("app");
  if (!app) return;

  let syncFrame = 0;
  let lastSceneKey = "";
  let channelTimer = 0;
  let suppressChoiceMotion = false;
  let suppressChoiceTimer = 0;

  function routePage() {
    return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean)[0] || "login";
  }

  function sceneSignature() {
    const investigation = document.querySelector(".retro-investigation");
    const frame = investigation?.querySelector(".retro-scene-frame");
    if (!investigation || !frame) return { frame: null, key: "" };

    const sessionId = investigation.dataset.sessionId || "";
    const mediaId = frame.querySelector(".retro-scene-media")?.dataset.mediaId || "";
    const location = String(frame.querySelector(".retro-location-card strong")?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    const phase = frame.querySelector(".retro-motion-overlay") ? "moving" : "still";
    return { frame, key: `${sessionId}|${mediaId}|${location}|${phase}` };
  }

  function ensureNoiseLayer(frame) {
    let layer = frame.querySelector(":scope > .retro-channel-noise");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "retro-channel-noise";
      layer.setAttribute("aria-hidden", "true");
      frame.appendChild(layer);
    }
    return layer;
  }

  function playChannelTransition(frame) {
    if (!frame) return;
    clearTimeout(channelTimer);
    ensureNoiseLayer(frame);
    frame.classList.remove("is-channel-switching");
    void frame.offsetWidth;
    frame.classList.add("is-channel-switching");
    window.BAEKJI_RETRO_SOUND_BOOST?.play?.("channel");
    channelTimer = setTimeout(() => frame.classList.remove("is-channel-switching"), 780);
  }

  function syncSceneTransition() {
    if (routePage() !== "investigate") {
      lastSceneKey = "";
      return;
    }

    const { frame, key } = sceneSignature();
    if (!frame || !key) return;
    if (key !== lastSceneKey) {
      lastSceneKey = key;
      playChannelTransition(frame);
    }
  }

  function markChoiceMotionSuppressed() {
    if (!suppressChoiceMotion) return;
    document.querySelectorAll(".retro-choice-launch, .retro-scene-actions").forEach((element) => {
      element.classList.add("retro-choice-no-enter");
    });
  }

  function profileInitial(name) {
    const latin = String(name || "").match(/[A-Z]/i)?.[0];
    return latin ? latin.toUpperCase() : String(name || "?").trim().slice(0, 1) || "?";
  }

  function profileDataUri(initial) {
    const safe = String(initial || "?").replace(/[^A-Z0-9가-힣?]/gi, "?");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#deded8"/><path d="M11 84c2-21 15-32 37-32s35 11 37 32" fill="#111"/><circle cx="48" cy="31" r="19" fill="#111"/><circle cx="48" cy="31" r="12" fill="#deded8"/><path d="M34 28h28v8H34z" fill="#111"/><rect x="8" y="8" width="24" height="24" fill="#111"/><text x="20" y="26" text-anchor="middle" font-family="monospace" font-size="18" font-weight="900" fill="#f6f6f2">${safe}</text><path d="M0 90h96v6H0z" fill="#111"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function decorateInviteGrid() {
    if (routePage() !== "party") return;
    const section = [...document.querySelectorAll("section.card")].find((candidate) =>
      String(candidate.querySelector("h2")?.textContent || "").trim() === "조원 초대"
    );
    const list = section?.querySelector(".list");
    if (!list) return;

    list.classList.add("retro-invite-grid");
    list.querySelectorAll(":scope > .list-item").forEach((card) => {
      card.classList.add("retro-invite-card");
      if (card.querySelector(":scope > .retro-invite-profile")) return;
      const name = String(card.querySelector(".list-title")?.textContent || "캐릭터").trim();
      const initial = profileInitial(name);
      const image = document.createElement("img");
      image.className = "retro-invite-profile";
      image.alt = `${name} 프로필`;
      image.src = profileDataUri(initial);
      card.prepend(image);
    });
  }

  function sync() {
    syncFrame = 0;
    markChoiceMotionSuppressed();
    decorateInviteGrid();
    syncSceneTransition();
  }

  function queueSync() {
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(() => requestAnimationFrame(sync));
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".retro-tab")) return;
    suppressChoiceMotion = true;
    clearTimeout(suppressChoiceTimer);
    document.body.setAttribute("data-choice-motion-suppressed", "true");
    queueSync();
    suppressChoiceTimer = setTimeout(() => {
      markChoiceMotionSuppressed();
      suppressChoiceMotion = false;
      document.body.removeAttribute("data-choice-motion-suppressed");
    }, 420);
  }, true);

  const observer = new MutationObserver(queueSync);
  observer.observe(app, { childList: true });
  window.addEventListener("hashchange", queueSync);
  window.addEventListener("pageshow", queueSync);

  window.__BAEKJI_INVESTIGATION_VISUAL_POLISH_TEST__ = Object.freeze({
    routePage,
    sceneSignature,
    profileInitial,
    profileDataUri,
    decorateInviteGrid,
    markChoiceMotionSuppressed,
  });

  queueSync();
})();