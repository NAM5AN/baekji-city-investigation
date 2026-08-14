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

  function sync() {
    syncFrame = 0;
    markChoiceMotionSuppressed();
    syncSceneTransition();
  }

  function queueSync() {
    markChoiceMotionSuppressed();
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
    markChoiceMotionSuppressed,
  });
  queueSync();
})();
