import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("profile-photo-editor.js", "utf8");
const css = fs.readFileSync("profile-photo-editor.css", "utf8");
const index = fs.readFileSync("index.html", "utf8");

assert(source.includes('const STAGE_MAX = 1280'), "editing decode should be downscaled to a bounded working image");
assert(source.includes('const OUTPUT_SIZE = 256'), "final profile photo must be exactly 256px square");
assert(!source.includes("createImageBitmap("), "iPhone-safe profile path must not allocate a full-resolution ImageBitmap");
assert(source.includes('original = await loadImage(originalUrl)'), "native image decoding should be used so iOS camera orientation is respected");
assert(source.includes('stage.width = Math.max(1, Math.round(width * ratio))'), "originals should be downscaled before the interactive editor stays open");
assert(source.includes('input.setAttribute("accept", "image/*")'), "iPhone HEIC/HEIF picker output should not be rejected by an overly narrow accept list");
assert(source.includes('new File([blob]'), "the editor should replace the chosen original with a small normalized JPEG file");
assert(source.includes('new DataTransfer()'), "the normalized crop should flow through the existing signup pipeline as the selected file");
assert(source.includes('canvas.addEventListener("pointerdown"'), "drag and mobile pointer gestures should be supported");
assert(source.includes('pointers.size >= 2'), "two-finger pinch zoom should be supported");
assert(source.includes('data-photo-editor-rotate'), "manual 90-degree rotation should be available as a recovery control");
assert(source.includes('active.zoom = Math.min(4'), "zoom must be bounded");
assert(source.includes('clampOffsets()'), "crop movement must be clamped so the 1:1 frame cannot expose empty areas");
assert(css.includes("aspect-ratio:1"), "crop viewport must be visually locked to 1:1");
assert(index.includes('profile-photo-editor.css?v=0.3.102'), "profile editor CSS must load in production");
assert(index.includes('profile-photo-editor.js?v=0.3.102'), "profile editor runtime must load in production");

console.log("PASS: iPhone-safe profile photo staging, orientation-preserving 1:1 crop, drag/pinch/rotate editing, and 256px output are wired");