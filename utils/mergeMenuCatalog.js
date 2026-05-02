import {
  MENU_ITEMS,
  BURGER_TOPPINGS,
  CRISPY_EXCLUDED_TOPPING_IDS,
} from "@/utils/menuData";

const ALLOWED_CATEGORIES = new Set([
  "burgers",
  "specials",
  "crispy",
  "sides",
  "drinks",
]);

const BASE_TOPPING_IDS = new Set(BURGER_TOPPINGS.map((r) => r.id));

/** @typedef {{ hiddenIds?: string[], customItems?: object[], overrides?: Record<string, object>, burgerToppings?: object }} CatalogEditor */

export function emptyBurgerToppingsEditor() {
  return { hiddenIds: [], customToppings: [], overrides: {} };
}

export function emptyCatalogEditor() {
  return {
    hiddenIds: [],
    customItems: [],
    overrides: {},
    burgerToppings: emptyBurgerToppingsEditor(),
  };
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

function pickToppingOverride(patch) {
  if (!patch || typeof patch !== "object") return {};
  const out = {};
  for (const k of ["price", "image", "nameHe", "nameAr"]) {
    if (patch[k] !== undefined && patch[k] !== null) out[k] = patch[k];
  }
  return out;
}

/**
 * @param {unknown} editor
 */
function getBurgerToppingsEditor(editor) {
  const e = editor && typeof editor === "object" ? editor : emptyCatalogEditor();
  const bt =
    e.burgerToppings && typeof e.burgerToppings === "object"
      ? e.burgerToppings
      : {};
  return {
    hiddenIds: Array.isArray(bt.hiddenIds) ? bt.hiddenIds : [],
    customToppings: Array.isArray(bt.customToppings) ? bt.customToppings : [],
    overrides:
      bt.overrides && typeof bt.overrides === "object" ? bt.overrides : {},
  };
}

/**
 * תוספות לבורגר/מיוחדים — מיזוג קטלוג (מוסתרים, עריכות, תוספות מותאמות).
 * @param {CatalogEditor | null | undefined} editor
 * @returns {{ id: string, price: number, image: string, nameHe?: string, nameAr?: string, excludeFromCrispy: boolean }[]}
 */
export function mergeBurgerToppingsFromEditor(editor) {
  const bt = getBurgerToppingsEditor(editor);
  const hidden = new Set(
    bt.hiddenIds.map((x) => String(x || "").trim()).filter(Boolean)
  );
  const overrides = bt.overrides;
  /** @type {{ id: string, price: number, image: string, nameHe?: string, nameAr?: string, excludeFromCrispy: boolean }[]} */
  const out = [];
  const seen = new Set();
  for (const row of BURGER_TOPPINGS) {
    if (hidden.has(row.id)) continue;
    const o = pickToppingOverride(overrides[row.id]);
    const price = Number.isFinite(Number(o.price)) ? Number(o.price) : row.price;
    const image =
      typeof o.image === "string" && o.image.trim() ? o.image.trim() : row.image;
    const nameHe =
      typeof o.nameHe === "string" && o.nameHe.trim()
        ? o.nameHe.trim()
        : undefined;
    const nameAr =
      typeof o.nameAr === "string" && o.nameAr.trim()
        ? o.nameAr.trim()
        : undefined;
    out.push({
      id: row.id,
      price,
      image,
      ...(nameHe ? { nameHe } : {}),
      ...(nameAr ? { nameAr } : {}),
      excludeFromCrispy: false,
    });
    seen.add(row.id);
  }
  for (const c of bt.customToppings) {
    if (!c || typeof c !== "object") continue;
    const id = String(c.id || "").trim();
    if (!id || seen.has(id)) continue;
    const nameHe = String(c.nameHe || "").trim();
    const nameAr = String(c.nameAr || "").trim();
    const image = String(c.image || "").trim();
    const price = Number(c.price);
    if (!nameHe || !nameAr || !image || !Number.isFinite(price) || price < 0) {
      continue;
    }
    out.push({
      id,
      price,
      image,
      nameHe,
      nameAr,
      excludeFromCrispy: Boolean(c.excludeFromCrispy),
    });
    seen.add(id);
  }
  return out;
}

/**
 * תוספות המוצגות במנות קריספי.
 * @param {CatalogEditor | null | undefined} editor
 */
export function mergeCrispyMealToppingsFromEditor(editor) {
  return mergeBurgerToppingsFromEditor(editor).filter(
    (row) =>
      !CRISPY_EXCLUDED_TOPPING_IDS.has(row.id) && !row.excludeFromCrispy
  );
}

/**
 * כל מזהי תוספות הבורגר לאחר מיזוג (מלאי / אימות הזמנה).
 * @param {CatalogEditor | null | undefined} editor
 * @returns {Set<string>}
 */
export function allBurgerToppingIdsFromEditor(editor) {
  return new Set(mergeBurgerToppingsFromEditor(editor).map((r) => r.id));
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
