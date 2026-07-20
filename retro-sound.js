(() => {
  "use strict";

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  let context = null;
  let master = null;
  let unlocked = false;
  let lastModalKey = "";
  let lastMovementKey = "";
  let lastRiskKey = "";
  const lastCueAt = new Map();

  function ensureContext() {
    if (!context) {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.72;
      master.connect(context.destination);
    }
    const resume = context.state === "suspended" ? context.resume() : Promise.resolve();
    return Promise.resolve(resume).then(() => {
      unlocked = context.state === "running";
      return unlocked;
    });
  }

  function envelope(gain, start, attack, hold, release, peak) {
    gain.gain.cancelScheduledValues(start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    gain.gain.setValueAtTime(Math.max(0.0002, peak), start + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + hold + release);
  }

  function tone({ frequency = 160, endFrequency = frequency, duration = 0.08, volume = 0.028, type = "square", delay = 0 }) {
    if (!context || !master) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(45, frequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, endFrequency), start + duration);
    filter.type = "lowpass";
    filter.frequency.value = 720;
    filter.Q.value = 0.65;
    envelope(gain, start, 0.006, Math.max(0.005, duration * 0.25), Math.max(0.025, duration * 0.68), volume);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.08);
  }

  function noise({ duration = 0.12, volume = 0.014, cutoff = 380, delay = 0 }) {
    if (!context || !master) return;
    const start = context.currentTime + delay;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.86 + white * 0.14;
      data[index] = previous;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.8;
    envelope(gain, start, 0.008, duration * 0.18, duration * 0.72, volume);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  const CUES = {
    click() {
      tone({ frequency: 165, endFrequency: 118, duration: 0.045, volume: 0.019, type: "square" });
    },
    tab() {
      tone({ frequency: 132, endFrequency: 158, duration: 0.055, volume: 0.017, type: "triangle" });
    },
    send() {
      tone({ frequency: 124, endFrequency: 172, duration: 0.07, volume: 0.024, type: "triangle" });
      tone({ frequency: 178, endFrequency: 205, duration: 0.055, volume: 0.014, type: "sine", delay: 0.045 });
    },
    popup() {
      noise({ duration: 0.11, volume: 0.011, cutoff: 310 });
      tone({ frequency: 104, endFrequency: 148, duration: 0.13, volume: 0.022, type: "triangle", delay: 0.018 });
    },
    page() {
      noise({ duration: 0.16, volume: 0.012, cutoff: 260 });
      tone({ frequency: 92, endFrequency: 126, duration: 0.16, volume: 0.018, type: "sine" });
    },
    move() {
      noise({ duration: 0.18, volume: 0.013, cutoff: 240 });
      tone({ frequency: 112, endFrequency: 86, duration: 0.09, volume: 0.021, type: "triangle" });
      tone({ frequency: 96, endFrequency: 74, duration: 0.08, volume: 0.016, type: "triangle", delay: 0.11 });
    },
    alert() {
      tone({ frequency: 126, endFrequency: 112, duration: 0.09, volume: 0.023, type: "square" });
      tone({ frequency: 126, endFrequency: 104, duration: 0.09, volume: 0.018, type: "square", delay: 0.12 });
    },
    confirm() {
      tone({ frequency: 138, endFrequency: 176, duration: 0.09, volume: 0.022, type: "triangle" });
      tone({ frequency: 176, endFrequency: 218, duration: 0.1, volume: 0.017, type: "sine", delay: 0.07 });
    },
    cancel() {
      tone({ frequency: 148, endFrequency: 92, duration: 0.13, volume: 0.023, type: "triangle" });
    },
    hold() {
      tone({ frequency: 118, endFrequency: 102, duration: 0.065, volume: 0.015, type: "sine" });
    },
  };

  function play(name) {
    const cue = CUES[name];
    if (!cue) return;
    const now = performance.now();
    if (now - Number(lastCueAt.get(name) || 0) < 70) return;
    lastCueAt.set(name, now);
    ensureContext().then((ready) => {
      if (ready) cue();
    }).catch(() => {});
  }

  function cueForButton(button) {
    if (button.matches("[data-send-chat]")) return "send";
    if (button.matches("[data-transfer-accept]")) return "confirm";
    if (button.matches("[data-transfer-reject], [data-transfer-cancel]")) return "cancel";
    if (button.matches("[data-transfer-reopen], .retro-transfer-close, .retro-modal-button.hold")) return "hold";
    if (button.matches("[data-move-route], [data-enter-investigation]")) return "move";
    if (button.matches(".retro-tab")) return "tab";
    return "click";
  }

  document.addEventListener("pointerdown", () => {
    ensureContext().catch(() => {});
  }, { capture: true, once: true });

  document.addEventListener("keydown", (event) => {
    if (!event.isTrusted) return;
    if (event.key === "Enter" && !event.shiftKey && event.target?.matches?.("[data-chat-input]")) play("send");
  }, true);

  document.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    const button = event.target.closest("button, [role='button']");
    if (!button || button.matches(":disabled")) return;
    play(cueForButton(button));
  }, true);

  window.addEventListener("hashchange", () => {
    if (unlocked) play("page");
  });

  const modalRoot = document.getElementById("modal-root");
  if (modalRoot) {
    new MutationObserver(() => {
      const modal = modalRoot.querySelector(".retro-modal");
      const key = modal
        ? `${modal.dataset.itemTransferModal || modal.dataset.itemTransferSenderModal || modal.className}:${String(modal.textContent || "").slice(0, 80)}`
        : "";
      if (key && key !== lastModalKey && unlocked) play("popup");
      lastModalKey = key;
    }).observe(modalRoot, { childList: true, subtree: true });
  }

  const app = document.getElementById("app");
  if (app) {
    new MutationObserver(() => {
      const movement = document.querySelector(".retro-motion-overlay");
      const movementKey = movement ? String(movement.textContent || "").replace(/\s+/g, " ").trim() : "";
      if (movementKey && movementKey !== lastMovementKey && unlocked) play("move");
      lastMovementKey = movementKey;

      const risk = document.querySelector(".retro-current-risk");
      const riskKey = risk ? String(risk.textContent || "").replace(/\s+/g, " ").trim() : "";
      if (riskKey && riskKey !== lastRiskKey && unlocked) play("alert");
      lastRiskKey = riskKey;
    }).observe(app, { childList: true, subtree: true });
  }

  window.BAEKJI_RETRO_SOUND = Object.freeze({ play, ensureContext, cueNames: Object.keys(CUES) });
})();