import { MENU_ITEMS } from "@/utils/menuData";

const ALLOWED_CATEGORIES = new Set([
  "burgers",
  "specials",
  "crispy",
  "sides",
  "drinks",
]);

/** @typedef {{ hiddenIds?: string[], customItems?: object[], overrides?: Record<string, object> }} CatalogEditor */

export function emptyCatalogEditor() {
  return { hiddenIds: [], customItems: [], overrides: {} };
}

function pickDefined(patch) {
  if (!patch || typeof patch !== "object") return {};
  const out = {};
  for (const k of [
    "basePrice",
    "category",
    "image",
    "nameHe",
    "nameAr",
    "descHe",
    "descAr",
  ]) {
    if (patch[k] !== undefined && patch[k] !== null) out[k] = patch[k];
  }
  return out;
}

/**
 * @param {CatalogEditor | null | undefined} editor
 * @returns {Array<{ id: string, basePrice: number, category: string, image: string, nameHe?: string, nameAr?: string, descHe?: string, descAr?: string }>}
 */
export function mergeMenuItemsFromEditor(editor) {
  const e = editor && typeof editor === "object" ? editor : emptyCatalogEditor();
  const hidden = new Set(
    (Array.isArray(e.hiddenIds) ? e.hiddenIds : []).filter(
      (x) => typeof x === "string" && x.length
    )
  );
  const overrides =
    e.overrides && typeof e.overrides === "object" ? e.overrides : {};
  const customRaw = Array.isArray(e.customItems) ? e.customItems : [];

  const byId = new Map();

  for (const row of MENU_ITEMS) {
    if (hidden.has(row.id)) continue;
    const o = pickDefined(overrides[row.id]);
    byId.set(row.id, {
      ...row,
      ...o,
      basePrice: Number(o.basePrice ?? row.basePrice) || 0,
      category: ALLOWED_CATEGORIES.has(String(o.category))
        ? String(o.category)
        : row.category,
      image: typeof o.image === "string" && o.image ? o.image : row.image,
    });
  }

  for (const c of customRaw) {
    if (!c || typeof c !== "object") continue;
    const id = typeof c.id === "string" ? c.id.trim() : "";
    if (!id) continue;
    const cat = String(c.category || "");
    if (!ALLOWED_CATEGORIES.has(cat)) continue;
    const nameHe = typeof c.nameHe === "string" ? c.nameHe.trim() : "";
    const nameAr = typeof c.nameAr === "string" ? c.nameAr.trim() : "";
    if (!nameHe || !nameAr) continue;
    const image = typeof c.image === "string" ? c.image.trim() : "";
    if (!image) continue;
    const basePrice = Number(c.basePrice);
    if (!Number.isFinite(basePrice) || basePrice < 0) continue;
    const descHe =
      typeof c.descHe === "string" ? c.descHe.trim() : "";
    const descAr =
      typeof c.descAr === "string" ? c.descAr.trim() : "";
    byId.set(id, {
      id,
      basePrice,
      category: cat,
      image,
      nameHe,
      nameAr,
      ...(descHe ? { descHe } : {}),
      ...(descAr ? { descAr } : {}),
    });
  }

  return Array.from(byId.values());
}

/**
 * @param {CatalogEditor | null | undefined} editor
 * @returns {Set<string>}
 */
export function managedMenuProductIdsFromEditor(editor) {
  const items = mergeMenuItemsFromEditor(editor);
  return new Set(items.map((x) => x.id));
}

/**
 * @param {CatalogEditor | null | undefined} editor
 * @returns {Set<string>}
 */
export function mainMealProductIdsFromEditor(editor) {
  const items = mergeMenuItemsFromEditor(editor);
  return new Set(
    items
      .filter(
        (x) =>
          x.category === "burgers" ||
          x.category === "crispy" ||
          x.category === "specials"
      )
      .map((x) => x.id)
  );
}
