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

export { data as day1ItemData };
