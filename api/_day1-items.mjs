import { readFileSync } from "node:fs";

// Server-owned source catalogue.  The browser may display the same data, but
// admin mutations must never trust an item object supplied by the browser.
const data = JSON.parse(readFileSync(new URL("../data/day1.json", import.meta.url), "utf8"));

export function catalogItem(itemId) {
  return data.itemCatalog?.[String(itemId || "")] || null;
}

export function worldItemSource(objectId, itemId) {
  const sourceObjectId = String(objectId || "");
  const catalogItemId = String(itemId || "");
  const mapping = (data.objectItems?.[sourceObjectId] || []).find((entry) => String(entry?.itemId || "") === catalogItemId);
  return mapping ? { objectId: sourceObjectId, itemId: catalogItemId, mapping, catalog: catalogItem(catalogItemId) } : null;
}

export function fieldObjectSource(objectId) {
  const sourceObjectId = String(objectId || "");
  for (const [detailId, entries] of Object.entries(data.objectsByDetail || {})) {
    const object = (Array.isArray(entries) ? entries : [entries]).find((entry) => String(entry?.id || "") === sourceObjectId);
    if (!object) continue;
    const place = Object.values(data.places || {}).find((candidate) => (candidate?.details || []).some((detail) => String(detail?.id || "") === String(detailId)));
    const detail = (place?.details || []).find((candidate) => String(candidate?.id || "") === String(detailId)) || null;
    return { object: JSON.parse(JSON.stringify(object)), detail: detail ? JSON.parse(JSON.stringify(detail)) : null, place: place ? JSON.parse(JSON.stringify(place)) : null };
  }
  return null;
}

export { data as day1ItemData };
