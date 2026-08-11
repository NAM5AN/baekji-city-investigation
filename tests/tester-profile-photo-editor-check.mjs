import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("profile-photo-editor.js", "utf8");
const css = fs.readFileSync("profile-photo-editor.css", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");

assert(source.includes('const STAGE_MAX = 1280'), "editing decode should be downscaled to a bounded working image");
assert(source.includes('const OUTPUT_SIZE = 256'), "final profile photo must be exactly 256px square");
assert(!source.includes("createImageBitmap("), "iPhone-safe profile path must not allocate a full-resolution ImageBitmap");
assert(source.includes('original = await loadImage(originalUrl)'), "native image decoding should be used so iOS camera orientation is respected");
assert(source.includes('stage.width = Math.max(1, Math.round(width * ratio))'), "originals should be downscaled before the interactive editor stays open");
assert(source.includes('input.setAttribute("accept", "image/*")'), "iPhone HEIC/HEIF picker output should not be rejected by an overly narrow accept list");
assert(source.includes('new File([blob]'), "the editor should replace the chosen original with a small normalized JPEG file");
assert(source.includes('new DataTransfer()'), "the normalized crop should flow through the existing signup pipeline as the selected file");
assert(source.includes('function fitImageRect()'), "the full source image should be fit inside the editor before cropping");
assert(source.includes('function sourceCrop()'), "the movable crop frame must map back to source-image pixels");
assert(source.includes('function resizeFromHandle('), "crop corners must resize the square selection");
assert(source.includes('active.crop.x += next.x - previous.x'), "dragging inside the crop must move the selection rather than the whole image");
assert(source.includes('setCropSize(active.gesture.cropSize / ratio'), "two-finger pinch should resize the crop selection");
assert(source.includes('data-photo-editor-preview'), "a live 1:1 result preview should show the effective zoomed crop");
assert(source.includes('max / active.crop.size'), "shrinking the crop should visibly increase the resulting zoom ratio");
assert(source.includes('data-photo-editor-rotate'), "manual 90-degree rotation should remain available");
assert(source.includes('ctx.drawImage(active.image, crop.sx, crop.sy, crop.size, crop.size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)'), "final output must use the selected square source region");
assert(css.includes(".tester-photo-editor__preview-row"), "the editor should expose a visible final crop preview");
assert(css.includes("cursor:move"), "the crop surface should communicate drag interaction");
assert(vercel.includes("img-src 'self' data: blob:"), "local blob photo previews must be allowed by CSP");
assert(index.includes('profile-photo-editor.css?v=0.3.103'), "new crop-frame CSS must load in production");
assert(index.includes('profile-photo-editor.js?v=0.3.103'), "new crop-frame runtime must load in production");

console.log("PASS: full-photo crop editor, movable/resizable 1:1 frame, live zoom preview, iPhone-safe staging, and 256px output are wired");