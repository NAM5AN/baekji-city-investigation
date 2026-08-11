(() => {
  "use strict";

  if (window.__BAEKJI_PROFILE_PHOTO_EDITOR__) return;

  const INPUT_SELECTOR = 'input[name="photo"][type="file"]';
  const EDIT_SIZE = 512;
  const OUTPUT_SIZE = 256;
  const STAGE_MAX = 1280;
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const safeFiles = new WeakMap();
  const pointers = new Map();
  let active = null;
  let modal = null;
  let canvas = null;
  let zoomInput = null;
  let bodyOverflow = "";

  function photoError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function isLikelyImage(file) {
    if (!file) return false;
    if (String(file.type || "").startsWith("image/")) return true;
    return /\.(?:jpe?g|png|webp|heic|heif)$/i.test(String(file.name || ""));
  }

  function showMessage(input, text) {
    const message = input?.closest?.("[data-tester-form]")?.querySelector?.("[data-tester-message]");
    if (message) message.textContent = text;
  }

  function errorText(error) {
    if (error?.code === "PROFILE_PHOTO_TOO_LARGE") return "사진 용량이 너무 큽니다. 25MB 이하 사진을 선택해 주세요.";
    if (error?.code === "PROFILE_PHOTO_EDITOR_UNSUPPORTED") return "이 브라우저에서는 사진 편집을 시작할 수 없습니다. 브라우저를 업데이트한 뒤 다시 시도해 주세요.";
    if (error?.code === "INVALID_PROFILE_PHOTO") return "선택한 사진을 읽을 수 없습니다. 다른 사진을 선택해 주세요.";
    return "사진을 불러오지 못했습니다. 다른 사진을 선택해 주세요.";
  }

  function canvasToBlob(source, type, quality) {
    return new Promise((resolve, reject) => {
      source.toBlob((blob) => blob ? resolve(blob) : reject(photoError("INVALID_PROFILE_PHOTO")), type, quality);
    });
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(photoError("INVALID_PROFILE_PHOTO"));
      image.src = url;
    });
  }

  async function stageFile(file) {
    if (!isLikelyImage(file)) throw photoError("INVALID_PROFILE_PHOTO");
    if (Number(file.size) > MAX_FILE_BYTES) throw photoError("PROFILE_PHOTO_TOO_LARGE");

    const originalUrl = URL.createObjectURL(file);
    let original = null;
    try {
      // iOS WebKit is intentionally kept off createImageBitmap here. Native <img>
      // decoding preserves camera orientation more reliably and avoids the prior
      // full-resolution ImageBitmap allocation spike before the editor opens.
      original = await loadImage(originalUrl);
      const width = Number(original.naturalWidth || original.width);
      const height = Number(original.naturalHeight || original.height);
      if (!width || !height) throw photoError("INVALID_PROFILE_PHOTO");

      const ratio = Math.min(1, STAGE_MAX / Math.max(width, height));
      const stage = document.createElement("canvas");
      stage.width = Math.max(1, Math.round(width * ratio));
      stage.height = Math.max(1, Math.round(height * ratio));
      const ctx = stage.getContext("2d", { alpha: false });
      if (!ctx) throw photoError("PROFILE_PHOTO_EDITOR_UNSUPPORTED");
      ctx.fillStyle = "#f6f6f2";
      ctx.fillRect(0, 0, stage.width, stage.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(original, 0, 0, stage.width, stage.height);

      const stagedBlob = await canvasToBlob(stage, "image/jpeg", 0.9);
      stage.width = stage.height = 1;
      const stagedUrl = URL.createObjectURL(stagedBlob);
      const stagedImage = await loadImage(stagedUrl);
      return { image: stagedImage, url: stagedUrl, fileName: file.name || "profile.jpg" };
    } finally {
      if (original) original.src = "";
      URL.revokeObjectURL(originalUrl);
    }
  }

  function buildModal() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "tester-photo-editor";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="tester-photo-editor__backdrop" data-photo-editor-cancel></div>
      <section class="tester-photo-editor__dialog" role="dialog" aria-modal="true" aria-labelledby="tester-photo-editor-title">
        <div class="tester-photo-editor__head">
          <div><strong id="tester-photo-editor-title">프로필 사진 편집</strong><small>정사각형 영역에 맞춰 위치와 크기를 조절하세요.</small></div>
          <button type="button" class="button ghost" data-photo-editor-cancel aria-label="닫기">닫기</button>
        </div>
        <div class="tester-photo-editor__stage">
          <canvas width="${EDIT_SIZE}" height="${EDIT_SIZE}" data-photo-editor-canvas aria-label="프로필 사진 자르기 영역"></canvas>
          <div class="tester-photo-editor__frame" aria-hidden="true"></div>
        </div>
        <div class="tester-photo-editor__controls">
          <label>크기 조절 <input type="range" min="1" max="4" step="0.01" value="1" data-photo-editor-zoom></label>
          <div class="tester-photo-editor__tools">
            <button type="button" class="button ghost" data-photo-editor-rotate>↻ 90° 회전</button>
            <button type="button" class="button ghost" data-photo-editor-reset>원위치</button>
          </div>
        </div>
        <p class="tester-photo-editor__hint">사진을 드래그해 이동 · 두 손가락으로 확대/축소 · 최종 256×256 저장</p>
        <div class="tester-photo-editor__actions">
          <button type="button" class="button ghost" data-photo-editor-cancel>취소</button>
          <button type="button" class="button primary" data-photo-editor-apply>이대로 사용</button>
        </div>
      </section>`;
    (document.querySelector("#modal-root") || document.body).append(modal);
    canvas = modal.querySelector("[data-photo-editor-canvas]");
    zoomInput = modal.querySelector("[data-photo-editor-zoom]");

    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-photo-editor-cancel]")) closeEditor(null);
      else if (event.target.closest("[data-photo-editor-rotate]")) rotateEditor();
      else if (event.target.closest("[data-photo-editor-reset]")) resetEditor();
      else if (event.target.closest("[data-photo-editor-apply]")) void applyEditor();
    });
    zoomInput.addEventListener("input", () => {
      if (!active) return;
      active.zoom = Number(zoomInput.value) || 1;
      clampOffsets();
      drawEditor();
    });
    canvas.addEventListener("wheel", (event) => {
      if (!active) return;
      event.preventDefault();
      active.zoom = Math.min(4, Math.max(1, active.zoom * (event.deltaY < 0 ? 1.08 : 0.92)));
      zoomInput.value = String(active.zoom);
      clampOffsets();
      drawEditor();
    }, { passive: false });

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
  }

  function rotatedSize() {
    if (!active) return { width: 1, height: 1 };
    const quarter = (active.rotation / 90) % 2;
    return quarter
      ? { width: active.image.naturalHeight, height: active.image.naturalWidth }
      : { width: active.image.naturalWidth, height: active.image.naturalHeight };
  }

  function baseScale() {
    const size = rotatedSize();
    return Math.max(EDIT_SIZE / size.width, EDIT_SIZE / size.height);
  }

  function currentScale() {
    return baseScale() * (active?.zoom || 1);
  }

  function clampOffsets() {
    if (!active) return;
    const size = rotatedSize();
    const scale = currentScale();
    const maxX = Math.max(0, (size.width * scale - EDIT_SIZE) / 2);
    const maxY = Math.max(0, (size.height * scale - EDIT_SIZE) / 2);
    active.offsetX = Math.max(-maxX, Math.min(maxX, active.offsetX));
    active.offsetY = Math.max(-maxY, Math.min(maxY, active.offsetY));
  }

  function paint(target, targetSize) {
    if (!active) return;
    const ctx = target.getContext("2d", { alpha: false });
    const ratio = targetSize / EDIT_SIZE;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#f6f6f2";
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.translate(targetSize / 2 + active.offsetX * ratio, targetSize / 2 + active.offsetY * ratio);
    ctx.rotate(active.rotation * Math.PI / 180);
    const scale = currentScale() * ratio;
    ctx.scale(scale, scale);
    ctx.drawImage(active.image, -active.image.naturalWidth / 2, -active.image.naturalHeight / 2);
    ctx.restore();
  }

  function drawEditor() {
    if (!active || !canvas) return;
    paint(canvas, EDIT_SIZE);
  }

  function resetEditor() {
    if (!active) return;
    active.zoom = 1;
    active.offsetX = 0;
    active.offsetY = 0;
    zoomInput.value = "1";
    clampOffsets();
    drawEditor();
  }

  function rotateEditor() {
    if (!active) return;
    active.rotation = (active.rotation + 90) % 360;
    resetEditor();
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * EDIT_SIZE / rect.width,
      y: (event.clientY - rect.top) * EDIT_SIZE / rect.height,
    };
  }

  function pointerDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointerCenter(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function beginPinch() {
    if (!active || pointers.size < 2) return;
    const [a, b] = Array.from(pointers.values()).slice(0, 2);
    active.pinch = {
      distance: Math.max(1, pointerDistance(a, b)),
      center: pointerCenter(a, b),
      zoom: active.zoom,
      offsetX: active.offsetX,
      offsetY: active.offsetY,
    };
  }

  function onPointerDown(event) {
    if (!active) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, canvasPoint(event));
    if (pointers.size === 1) active.dragLast = pointers.get(event.pointerId);
    if (pointers.size === 2) beginPinch();
  }

  function onPointerMove(event) {
    if (!active || !pointers.has(event.pointerId)) return;
    event.preventDefault();
    const next = canvasPoint(event);
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, next);

    if (pointers.size >= 2) {
      if (!active.pinch) beginPinch();
      const [a, b] = Array.from(pointers.values()).slice(0, 2);
      const center = pointerCenter(a, b);
      const distance = Math.max(1, pointerDistance(a, b));
      active.zoom = Math.min(4, Math.max(1, active.pinch.zoom * distance / active.pinch.distance));
      active.offsetX = active.pinch.offsetX + (center.x - active.pinch.center.x);
      active.offsetY = active.pinch.offsetY + (center.y - active.pinch.center.y);
      zoomInput.value = String(active.zoom);
    } else {
      active.offsetX += next.x - previous.x;
      active.offsetY += next.y - previous.y;
    }
    clampOffsets();
    drawEditor();
  }

  function onPointerUp(event) {
    if (!active) return;
    pointers.delete(event.pointerId);
    active.pinch = null;
    if (pointers.size === 1) active.dragLast = Array.from(pointers.values())[0];
  }

  function openEditor(staged) {
    buildModal();
    return new Promise((resolve) => {
      active = {
        ...staged,
        resolve,
        rotation: 0,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        pinch: null,
      };
      pointers.clear();
      zoomInput.value = "1";
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.classList.add("tester-photo-editor-open");
      modal.hidden = false;
      clampOffsets();
      drawEditor();
    });
  }

  function closeEditor(result) {
    if (!active) return;
    const current = active;
    active = null;
    pointers.clear();
    if (modal) modal.hidden = true;
    document.body.style.overflow = bodyOverflow;
    document.body.classList.remove("tester-photo-editor-open");
    try { current.image.src = ""; } catch {}
    URL.revokeObjectURL(current.url);
    current.resolve(result);
  }

  async function applyEditor() {
    if (!active) return;
    const apply = modal.querySelector("[data-photo-editor-apply]");
    apply.disabled = true;
    try {
      const output = document.createElement("canvas");
      output.width = output.height = OUTPUT_SIZE;
      paint(output, OUTPUT_SIZE);
      const blob = await canvasToBlob(output, "image/jpeg", 0.84);
      output.width = output.height = 1;
      const base = String(active.fileName || "profile").replace(/\.[^.]+$/, "") || "profile";
      closeEditor(new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
    } catch {
      closeEditor(null);
    } finally {
      apply.disabled = false;
    }
  }

  async function editFile(file) {
    const staged = await stageFile(file);
    return openEditor(staged);
  }

  function assignFile(input, file) {
    if (!file) {
      input.value = "";
      return;
    }
    if (typeof DataTransfer !== "function") throw photoError("PROFILE_PHOTO_EDITOR_UNSUPPORTED");
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    if (input.files?.[0] !== file && input.files?.[0]?.name !== file.name) throw photoError("PROFILE_PHOTO_EDITOR_UNSUPPORTED");
  }

  async function interceptChange(event) {
    const input = event.target;
    if (!input?.matches?.(INPUT_SELECTOR)) return;
    if (input.dataset.photoEditorReady === "1") {
      delete input.dataset.photoEditorReady;
      return;
    }
    const original = input.files?.[0];
    if (!original) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const previous = safeFiles.get(input) || null;
    input.disabled = true;
    showMessage(input, "사진을 준비하고 있습니다…");
    try {
      const safeFile = await editFile(original);
      if (!safeFile) {
        assignFile(input, previous);
        showMessage(input, previous ? "기존 프로필 사진을 유지합니다." : "");
        return;
      }
      safeFiles.set(input, safeFile);
      assignFile(input, safeFile);
      input.dataset.photoEditorReady = "1";
      showMessage(input, "");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (error) {
      try { assignFile(input, previous); } catch { input.value = ""; }
      showMessage(input, errorText(error));
    } finally {
      input.disabled = false;
    }
  }

  document.addEventListener("click", (event) => {
    const label = event.target?.closest?.('label[for="tester-photo"]');
    const input = label ? document.getElementById("tester-photo") : event.target?.closest?.(INPUT_SELECTOR);
    if (input?.matches?.(INPUT_SELECTOR)) input.setAttribute("accept", "image/*");
  }, true);
  document.addEventListener("change", (event) => { void interceptChange(event); }, true);

  window.__BAEKJI_PROFILE_PHOTO_EDITOR__ = Object.freeze({
    editFile,
    constants: Object.freeze({ EDIT_SIZE, OUTPUT_SIZE, STAGE_MAX, MAX_FILE_BYTES }),
    isLikelyImage,
  });
})();