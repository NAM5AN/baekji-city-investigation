(() => {
  "use strict";
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  const PRE_INVESTIGATION_ROUTES = new Set(["home", "party", "briefing"]);
  let ctx;
  let out;
  let lastRoute = routePage();
  const last = new Map();

  function routePage() {
    return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean)[0] || "login";
  }

  function ready() {
    if (!ctx) {
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 0.95;
      out.connect(ctx.destination);
    }
    return ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
  }

  function tone(from, to, duration = 0.09, volume = 0.075, type = "triangle") {
    if (!ctx || !out) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    filter.type = "lowpass";
    filter.frequency.value = 760;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + duration + 0.04);
  }

  function staticBurst(duration = 0.18, volume = 0.13) {
    if (!ctx || !out) return;
    const now = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;

    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.72 + white * 0.28;
      const gate = index % 17 < 11 ? 1 : 0.48;
      data[index] = previous * gate;
    }

    const source = ctx.createBufferSource();
    const highpass = ctx.createBiquadFilter();
    const lowpass = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    source.buffer = buffer;
    highpass.type = "highpass";
    highpass.frequency.value = 70;
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1250;
    lowpass.Q.value = 0.65;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.setValueAtTime(volume * 0.72, now + duration * 0.56);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(out);
    source.start(now);
    source.stop(now + duration + 0.03);
  }

  function transitionStatic() {
    staticBurst(0.19, 0.135);
    tone(92, 58, 0.2, 0.075, "sawtooth");
    setTimeout(() => staticBurst(0.075, 0.07), 88);
  }

  function play(name) {
    const now = performance.now();
    if (now - Number(last.get(name) || 0) < 70) return;
    last.set(name, now);
    ready().then(() => {
      if (name === "transition") transitionStatic();
      else if (name === "send") { tone(118, 186, 0.11, 0.09); setTimeout(() => tone(176, 220, 0.08, 0.06, "sine"), 48); }
      else if (name === "move") { tone(112, 72, 0.14, 0.09); setTimeout(() => tone(92, 64, 0.1, 0.065), 110); }
      else if (name === "popup") tone(96, 152, 0.16, 0.085);
      else if (name === "confirm") tone(136, 214, 0.13, 0.09);
      else if (name === "cancel") tone(152, 82, 0.15, 0.09);
      else tone(168, 108, 0.065, 0.07, "square");
    }).catch(() => {});
  }

  function handleRouteTransition() {
    const nextRoute = routePage();
    const shouldPlay = nextRoute !== lastRoute &&
      PRE_INVESTIGATION_ROUTES.has(nextRoute) &&
      (lastRoute === "login" || PRE_INVESTIGATION_ROUTES.has(lastRoute));
    lastRoute = nextRoute;
    if (shouldPlay) play("transition");
  }

  document.addEventListener("pointerdown", () => ready().catch(() => {}), { capture: true, once: true });
  document.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    const button = event.target.closest("button, [role='button']");
    if (!button || button.matches(":disabled")) return;
    if (button.matches("[data-send-chat]")) play("send");
    else if (button.matches("[data-move-route], [data-enter-investigation]")) play("move");
    else if (button.matches("[data-transfer-accept]")) play("confirm");
    else if (button.matches("[data-transfer-reject], [data-transfer-cancel]")) play("cancel");
    else play("click");
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.isTrusted && event.key === "Enter" && !event.shiftKey && event.target?.matches?.("[data-chat-input]")) play("send");
  }, true);
  window.addEventListener("hashchange", handleRouteTransition);

  const modalRoot = document.getElementById("modal-root");
  if (modalRoot) new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length)) play("popup");
  }).observe(modalRoot, { childList: true });

  window.BAEKJI_RETRO_SOUND_BOOST = Object.freeze({
    play,
    ready,
    routePage,
    handleRouteTransition,
    transitionStatic,
  });
})();