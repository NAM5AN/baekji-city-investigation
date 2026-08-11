(() => {
  "use strict";

  if (window.__BAEKJI_PROFILE_PHOTO_EDITOR__) return;

  const INPUT_SELECTOR = 'input[name="photo"][type="file"]';
  const EDIT_SIZE = 512;
  const OUTPUT_SIZE = 256;
  const STAGE_MAX = 1280;
  const STAGE_PADDING = 24;
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const HANDLE_RADIUS = 24;
  const safeFiles = new WeakMap();
  const pointers = new Map();
  let active = null;
  let modal = null;
  let canvas = null;
  let previewCanvas = null;
  let cropSizeInput = null;
  let cropZoomLabel = null;
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
          <div><strong id="tester-photo-editor-title">프로필 사진 편집</strong><small>전체 사진 위에서 정사각형 선택 영역을 이동하거나 크기를 바꾸세요.</small></div>
          <button type="button" class="button ghost" data-photo-editor-cancel aria-label="닫기">닫기</button>
        </div>
        <div class="tester-photo-editor__stage">
          <canvas width="${EDIT_SIZE}" height="${EDIT_SIZE}" data-photo-editor-canvas aria-label="전체 사진과 정사각형 자르기 영역"></canvas>
        </div>
        <div class="tester-photo-editor__preview-row">
          <div class="tester-photo-editor__preview-copy"><strong>최종 1:1 미리보기</strong><small>선택 영역을 줄일수록 결과가 확대됩니다.</small></div>
          <div class="tester-photo-editor__preview-box"><canvas width="128" height="128" data-photo-editor-preview aria-label="최종 프로필 사진 미리보기"></canvas><output data-photo-editor-zoom-label>1.0×</output></div>
        </div>
        <div class="tester-photo-editor__controls">
          <label>선택 영역 크기 <input type="range" min="20" max="100" step="1" value="82" data-photo-editor-crop-size></label>
          <div class="tester-photo-editor__tools">
            <button type="button" class="button ghost" data-photo-editor-rotate>↻ 90° 회전</button>
            <button type="button" class="button ghost" data-photo-editor-reset>원위치</button>
          </div>
        </div>
        <p class="tester-photo-editor__hint">격자 안을 드래그해 이동 · 흰 모서리 사각형을 드래그해 크기 조절 · 두 손가락으로 확대/축소 · 최종 256×256 저장</p>
        <div class="tester-photo-editor__actions">
          <button type="button" class="button ghost" data-photo-editor-cancel>취소</button>
          <button type="button" class="button primary" data-photo-editor-apply>이대로 사용</button>
        </div>
      </section>`;
    (document.querySelector("#modal-root") || document.body).append(modal);
    canvas = modal.querySelector("[data-photo-editor-canvas]");
    previewCanvas = modal.querySelector("[data-photo-editor-preview]");
    cropSizeInput = modal.querySelector("[data-photo-editor-crop-size]");
    cropZoomLabel = modal.querySelector("[data-photo-editor-zoom-label]");

    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-photo-editor-cancel]")) closeEditor(null);
      else if (event.target.closest("[data-photo-editor-rotate]")) void rotateEditor();
      else if (event.target.closest("[data-photo-editor-reset]")) resetEditor();
      else if (event.target.closest("[data-photo-editor-apply]")) void applyEditor();
    });

    cropSizeInput.addEventListener("input", () => {
      if (!active) return;
      const max = maxCropSize();
      const min = minimumCropSize();
      const ratio = Math.max(0, Math.min(1, (Number(cropSizeInput.value) - 20) / 80));
      setCropSize(min + (max - min) * ratio, cropCenter());
      drawEditor();
    });

    canvas.addEventListener("wheel", (event) => {
      if (!active) return;
      const point = canvasPoint(event);
      if (!pointInCrop(point)) return;
      event.preventDefault();
      setCropSize(active.crop.size * (event.deltaY < 0 ? 0.9 : 1.1), point);
      syncCropControl();
      drawEditor();
    }, { passive: false });

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", () => {
      if (!pointers.size && canvas) canvas.style.cursor = "default";
    });
  }

  function fitImageRect() {
    if (!active?.image) return { x: STAGE_PADDING, y: STAGE_PADDING, width: 1, height: 1, scale: 1 };
    const width = active.image.naturalWidth || 1;
    const height = active.image.naturalHeight || 1;
    const usable = EDIT_SIZE - STAGE_PADDING * 2;
    const scale = Math.min(usable / width, usable / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    return {
      x: (EDIT_SIZE - drawWidth) / 2,
      y: (EDIT_SIZE - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
      scale,
    };
  }

  function maxCropSize() {
    const rect = active?.imageRect || fitImageRect();
    return Math.max(1, Math.min(rect.width, rect.height));
  }

  function minimumCropSize() {
    const max = maxCropSize();
    return Math.min(max, Math.max(24, max * 0.2));
  }

  function cropCenter() {
    if (!active?.crop) return { x: EDIT_SIZE / 2, y: EDIT_SIZE / 2 };
    return { x: active.crop.x + active.crop.size / 2, y: active.crop.y + active.crop.size / 2 };
  }

  function clampCropPosition() {
    if (!active?.crop) return;
    const rect = active.imageRect;
    const crop = active.crop;
    crop.x = Math.max(rect.x, Math.min(rect.x + rect.width - crop.size, crop.x));
    crop.y = Math.max(rect.y, Math.min(rect.y + rect.height - crop.size, crop.y));
  }

  function setCropSize(nextSize, center = cropCenter()) {
    if (!active?.crop) return;
    const min = minimumCropSize();
    const max = maxCropSize();
    const size = Math.max(min, Math.min(max, Number(nextSize) || max));
    active.crop.size = size;
    active.crop.x = center.x - size / 2;
    active.crop.y = center.y - size / 2;
    clampCropPosition();
  }

  function resetCrop() {
    if (!active) return;
    active.imageRect = fitImageRect();
    const max = maxCropSize();
    const size = max * 0.82;
    active.crop = {
      size,
      x: active.imageRect.x + (active.imageRect.width - size) / 2,
      y: active.imageRect.y + (active.imageRect.height - size) / 2,
    };
    syncCropControl();
  }

  function sourceCrop() {
    if (!active?.crop) return { sx: 0, sy: 0, size: 1 };
    const rect = active.imageRect;
    const imageScale = rect.scale || 1;
    return {
      sx: Math.max(0, (active.crop.x - rect.x) / imageScale),
      sy: Math.max(0, (active.crop.y - rect.y) / imageScale),
      size: active.crop.size / imageScale,
    };
  }

  function syncCropControl() {
    if (!active || !cropSizeInput) return;
    const min = minimumCropSize();
    const max = maxCropSize();
    const ratio = max <= min ? 1 : (active.crop.size - min) / (max - min);
    cropSizeInput.value = String(Math.round(20 + Math.max(0, Math.min(1, ratio)) * 80));
    if (cropZoomLabel) cropZoomLabel.value = `${(max / active.crop.size).toFixed(1)}×`;
  }

  function drawGrid(ctx, crop) {
    ctx.save();
    ctx.strokeStyle = "rgba(17,17,17,.58)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i += 1) {
      const offset = crop.size * i / 3;
      ctx.beginPath();
      ctx.moveTo(crop.x + offset, crop.y);
      ctx.lineTo(crop.x + offset, crop.y + crop.size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(crop.x, crop.y + offset);
      ctx.lineTo(crop.x + crop.size, crop.y + offset);
      ctx.stroke();
    }
    ctx.restore();
  }

  function handlePoints() {
    const crop = active.crop;
    return {
      tl: { x: crop.x, y: crop.y },
      tr: { x: crop.x + crop.size, y: crop.y },
      bl: { x: crop.x, y: crop.y + crop.size },
      br: { x: crop.x + crop.size, y: crop.y + crop.size },
    };
  }

  function drawHandles(ctx) {
    ctx.save();
    ctx.fillStyle = "#f6f6f2";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 3;
    Object.values(handlePoints()).forEach((point) => {
      ctx.fillRect(point.x - 7, point.y - 7, 14, 14);
      ctx.strokeRect(point.x - 7, point.y - 7, 14, 14);
    });
    ctx.restore();
  }

  function drawPreview() {
    if (!active || !previewCanvas) return;
    const ctx = previewCanvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const crop = sourceCrop();
    ctx.fillStyle = "#f6f6f2";
    ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(active.image, crop.sx, crop.sy, crop.size, crop.size, 0, 0, previewCanvas.width, previewCanvas.height);
  }

  function drawEditor() {
    if (!active || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const rect = active.imageRect;
    const crop = active.crop;
    const source = sourceCrop();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#d8d8d2";
    ctx.fillRect(0, 0, EDIT_SIZE, EDIT_SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(active.image, rect.x, rect.y, rect.width, rect.height);

    ctx.fillStyle = "rgba(0,0,0,.48)";
    ctx.fillRect(0, 0, EDIT_SIZE, EDIT_SIZE);
    ctx.drawImage(active.image, source.sx, source.sy, source.size, source.size, crop.x, crop.y, crop.size, crop.size);

    ctx.strokeStyle = "#111";
    ctx.lineWidth = 4;
    ctx.strokeRect(crop.x, crop.y, crop.size, crop.size);
    drawGrid(ctx, crop);
    drawHandles(ctx);
    drawPreview();
    syncCropControl();
  }

  function pointInCrop(point) {
    if (!active?.crop) return false;
    const crop = active.crop;
    return point.x >= crop.x && point.x <= crop.x + crop.size && point.y >= crop.y && point.y <= crop.y + crop.size;
  }

  function hitHandle(point) {
    if (!active?.crop) return null;
    const handles = handlePoints();
    return Object.entries(handles).find(([, handle]) => Math.hypot(point.x - handle.x, point.y - handle.y) <= HANDLE_RADIUS)?.[0] || null;
  }

  function cursorForPoint(point) {
    const handle = hitHandle(point);
    if (handle === "tl" || handle === "br") return "nwse-resize";
    if (handle === "tr" || handle === "bl") return "nesw-resize";
    if (pointInCrop(point)) return "move";
    return "default";
  }

  function updatePointerCursor(point) {
    if (!canvas) return;
    if (active?.gesture?.type === "resize") {
      const handle = active.gesture.handle;
      canvas.style.cursor = (handle === "tl" || handle === "br") ? "nwse-resize" : "nesw-resize";
      return;
    }
    if (active?.gesture?.type === "move" && pointers.size) {
      canvas.style.cursor = "move";
      return;
    }
    canvas.style.cursor = cursorForPoint(point);
  }

  function pointInImage(point) {
    const rect = active?.imageRect;
    return Boolean(rect && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);
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
    active.gesture = {
      type: "pinch",
      distance: Math.max(1, pointerDistance(a, b)),
      center: pointerCenter(a, b),
      cropSize: active.crop.size,
      cropCenter: cropCenter(),
    };
  }

  function resizeFromHandle(handle, point) {
    const crop = active.crop;
    const rect = active.imageRect;
    let anchorX = crop.x;
    let anchorY = crop.y;
    let directionX = 1;
    let directionY = 1;

    if (handle === "tl") {
      anchorX = crop.x + crop.size;
      anchorY = crop.y + crop.size;
      directionX = -1;
      directionY = -1;
    } else if (handle === "tr") {
      anchorX = crop.x;
      anchorY = crop.y + crop.size;
      directionX = 1;
      directionY = -1;
    } else if (handle === "bl") {
      anchorX = crop.x + crop.size;
      anchorY = crop.y;
      directionX = -1;
      directionY = 1;
    }

    const wanted = Math.max(Math.abs(point.x - anchorX), Math.abs(point.y - anchorY));
    const maxX = directionX > 0 ? rect.x + rect.width - anchorX : anchorX - rect.x;
    const maxY = directionY > 0 ? rect.y + rect.height - anchorY : anchorY - rect.y;
    const size = Math.max(minimumCropSize(), Math.min(wanted, maxX, maxY, maxCropSize()));
    crop.size = size;
    crop.x = directionX > 0 ? anchorX : anchorX - size;
    crop.y = directionY > 0 ? anchorY : anchorY - size;
    clampCropPosition();
  }

  function onPointerDown(event) {
    if (!active) return;
    const point = canvasPoint(event);
    const handle = hitHandle(point);
    const insideCrop = pointInCrop(point);
    if (!handle && !insideCrop) return;

    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, point);

    if (pointers.size >= 2) {
      beginPinch();
      return;
    }

    if (handle) {
      active.gesture = { type: "resize", handle };
      updatePointerCursor(point);
      return;
    }

    active.gesture = { type: "move", last: point };
    updatePointerCursor(point);
  }

  function onPointerMove(event) {
    if (!active) return;
    const next = canvasPoint(event);

    if (!pointers.has(event.pointerId)) {
      updatePointerCursor(next);
      return;
    }

    event.preventDefault();
    pointers.set(event.pointerId, next);

    if (pointers.size >= 2) {
      if (active.gesture?.type !== "pinch") beginPinch();
      const [a, b] = Array.from(pointers.values()).slice(0, 2);
      const currentCenter = pointerCenter(a, b);
      const distance = Math.max(1, pointerDistance(a, b));
      const ratio = distance / active.gesture.distance;
      const shiftedCenter = {
        x: active.gesture.cropCenter.x + (currentCenter.x - active.gesture.center.x),
        y: active.gesture.cropCenter.y + (currentCenter.y - active.gesture.center.y),
      };
      setCropSize(active.gesture.cropSize / ratio, shiftedCenter);
      drawEditor();
      return;
    }

    if (active.gesture?.type === "resize") {
      resizeFromHandle(active.gesture.handle, next);
      drawEditor();
      updatePointerCursor(next);
      return;
    }

    if (active.gesture?.type === "move") {
      const previous = active.gesture.last;
      active.crop.x += next.x - previous.x;
      active.crop.y += next.y - previous.y;
      active.gesture.last = next;
      clampCropPosition();
      drawEditor();
      updatePointerCursor(next);
    }
  }

  function onPointerUp(event) {
    if (!active) return;
    const point = canvasPoint(event);
    pointers.delete(event.pointerId);
    if (pointers.size >= 2) beginPinch();
    else if (pointers.size === 1) active.gesture = { type: "move", last: Array.from(pointers.values())[0] };
    else active.gesture = null;
    updatePointerCursor(point);
  }

  function resetEditor() {
    if (!active) return;
    resetCrop();
    drawEditor();
    if (canvas) canvas.style.cursor = "default";
  }

  async function rotateEditor() {
    if (!active || active.rotating) return;
    active.rotating = true;
    const button = modal.querySelector("[data-photo-editor-rotate]");
    if (button) button.disabled = true;
    try {
      const source = active.image;
      const rotated = document.createElement("canvas");
      rotated.width = source.naturalHeight;
      rotated.height = source.naturalWidth;
      const ctx = rotated.getContext("2d", { alpha: false });
      if (!ctx) throw photoError("PROFILE_PHOTO_EDITOR_UNSUPPORTED");
      ctx.fillStyle = "#f6f6f2";
      ctx.fillRect(0, 0, rotated.width, rotated.height);
      ctx.translate(rotated.width / 2, rotated.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
      const blob = await canvasToBlob(rotated, "image/jpeg", 0.9);
      rotated.width = rotated.height = 1;
      const nextUrl = URL.createObjectURL(blob);
      const nextImage = await loadImage(nextUrl);
      const oldUrl = active.url;
      try { active.image.src = ""; } catch {}
      active.image = nextImage;
      active.url = nextUrl;
      URL.revokeObjectURL(oldUrl);
      resetCrop();
      drawEditor();
      if (canvas) canvas.style.cursor = "default";
    } catch (error) {
      console.warn("[profile-photo-editor] rotate failed", error);
    } finally {
      active.rotating = false;
      if (button) button.disabled = false;
    }
  }

  function openEditor(staged) {
    buildModal();
    return new Promise((resolve) => {
      active = {
        ...staged,
        resolve,
        imageRect: null,
        crop: null,
        gesture: null,
        rotating: false,
      };
      pointers.clear();
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.classList.add("tester-photo-editor-open");
      modal.hidden = false;
      resetCrop();
      drawEditor();
      if (canvas) canvas.style.cursor = "default";
    });
  }

  function closeEditor(result) {
    if (!active) return;
    const current = active;
    active = null;
    pointers.clear();
    if (modal) modal.hidden = true;
    if (canvas) canvas.style.cursor = "default";
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
      const ctx = output.getContext("2d", { alpha: false });
      if (!ctx) throw photoError("PROFILE_PHOTO_EDITOR_UNSUPPORTED");
      const crop = sourceCrop();
      ctx.fillStyle = "#f6f6f2";
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(active.image, crop.sx, crop.sy, crop.size, crop.size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
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