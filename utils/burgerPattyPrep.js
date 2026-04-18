import { cartLineProductId } from "@/hooks/useCart";

/** מנה מיוחדת Cheese Bomb — קציצה 240 גר׳; מלאי כ־2×120 גר׳ */
export const SPECIAL_CHEESE_BOMB_ID = "special-cheese-bomb";

/** @param {unknown} it — שורת עגלה או { productId, specialPattyGrams } */
export function specialPattyGramsFromLine(it) {
  const pid = String(cartLineProductId(it) || "");
  if (!pid.startsWith("special-")) return null;
  if (pid === SPECIAL_CHEESE_BOMB_ID) return null;
  return Number(it?.specialPattyGrams) === 220 ? 220 : 200;
}

/**
 * מערך משקלי קציצות לשורת הזמנה (מנות מיוחדות: 200 או 220 לפי בחירה; Cheese Bomb — 2×120).
 * @param {unknown} it
 * @returns {number[] | null}
 */
export function pattyGramsArrayForOrderItem(it) {
  const pid = String(cartLineProductId(it) || "");
  const base = PATTIES_BY_PRODUCT_ID[pid];
  if (!base) return null;
  if (pid === SPECIAL_CHEESE_BOMB_ID) {
    return [120, 120];
  }
  if (pid.startsWith("special-")) {
    return [specialPattyGramsFromLine(it)];
  }
  return base;
}

/**
 * מיפוי מנה (בורגר בלבד) → משקלי קציצות בגרמים לפי טבלת המטבח.
 * 600ג׳: ברירת מחדל 3×200; קיימת חלופה 220+220+160 — מוצגת בהערה בניהול.
 */
export const PATTIES_BY_PRODUCT_ID = {
  "special-truffle-king": [200],
  "special-bbq-smoke": [200],
  "special-fire-burger": [200],
  "special-cheese-bomb": [120, 120],
  "special-lamb-bacon-deluxe": [200],
  "special-corned-beef-stack": [200],
  "kids-burger-120": [120],
  "burger-160": [160],
  "burger-200": [200],
  /** לא בתפריט — רק הזמנות ישנות / מלאי 220 משמש 440 ומיוחדים */
  "burger-220": [220],
  "smash-burger-240": [120, 120],
  "burger-320": [160, 160],
  "burger-360": [200, 160],
  "smash-burger-360": [120, 120, 120],
  "burger-400": [200, 200],
  "burger-440": [220, 220],
  "burger-480": [160, 160, 160],
  "burger-520": [200, 160, 160],
  "burger-560": [200, 200, 160],
  "burger-600": [200, 200, 200],
};

const PATTY_GRAMS_ORDER = [120, 160, 200, 220];

/**
 * @param {unknown[]} items
 * @returns {{ counts: Record<number, number>, qty600: number }}
 */
export function aggregatePattyCountsFromOrderItems(items) {
  /** @type {Record<number, number>} */
  const counts = { 120: 0, 160: 0, 200: 0, 220: 0 };
  let qty600 = 0;
  if (!Array.isArray(items)) return { counts, qty600 };

  for (const it of items) {
    const pid = String(cartLineProductId(it) || "");
    const patties = pattyGramsArrayForOrderItem(it);
    if (!patties) continue;
    const q = Math.max(1, Number(it.quantity) || 1);
    if (pid === "burger-600") qty600 += q;
    for (const g of patties) {
      counts[g] = (counts[g] || 0) + q;
    }
  }
  return { counts, qty600 };
}

export function hasAnyPattyPrep({ counts, qty600 }) {
  if (qty600 > 0) return true;
  return PATTY_GRAMS_ORDER.some((g) => (counts[g] || 0) > 0);
}

/**
 * @param {Record<number, number>} stock
 * @param {string} pid
 * @param {number} qty
 */
export function canBuildBurgerWithPattyStock(stock, pid, qty, specialPattyGrams) {
  const pidStr = String(pid || "");
  let patties = PATTIES_BY_PRODUCT_ID[pidStr];
  if (!patties) return true;
  if (pidStr.startsWith("special-")) {
    patties =
      pidStr === SPECIAL_CHEESE_BOMB_ID
        ? [120, 120]
        : [Number(specialPattyGrams) === 220 ? 220 : 200];
  }
  const q = Math.max(1, Math.floor(Number(qty) || 1));
  /** @type {Record<number, number>} */
  const need = { 120: 0, 160: 0, 200: 0, 220: 0 };
  for (const g of patties) {
    need[g] = (need[g] || 0) + q;
  }
  for (const g of PATTY_GRAMS_ORDER) {
    if (need[g] > (Number(stock[g]) || 0)) return false;
  }
  return true;
}

/**
 * @param {Record<number, number>} stock
 * @returns {string[]}
 */
export function computeAutoUnavailableBurgerIds(stock) {
  return Object.keys(PATTIES_BY_PRODUCT_ID).filter((pid) => {
    if (String(pid).startsWith("special-")) {
      if (pid === SPECIAL_CHEESE_BOMB_ID) {
        return !canBuildBurgerWithPattyStock(stock, pid, 1, undefined);
      }
      return (
        !canBuildBurgerWithPattyStock(stock, pid, 1, 200) &&
        !canBuildBurgerWithPattyStock(stock, pid, 1, 220)
      );
    }
    return !canBuildBurgerWithPattyStock(stock, pid, 1);
  });
}

/**
 * @param {Record<number, number>} counts
 * @param {Record<number, number>} stock
 */
export function pattyDemandFitsStock(counts, stock) {
  for (const g of PATTY_GRAMS_ORDER) {
    const need = Number(counts[g]) || 0;
    if (need > (Number(stock[g]) || 0)) return false;
  }
  return true;
}

/**
 * מקסימום יחידות של מנה (בורגר) מאותו productId שמתאימות למלאי,
 * אחרי שמייחסים שורות בעגלה שאינן מאותו productId.
 * @param {unknown[]} items — שורות עגלה (אובייקטים עם productId / id)
 * @param {string} productId
 * @param {Record<number, number>} stock
 * @returns {number | null} null אם המנה לא דורשת קציצות
 */
export function maxPattyUnitsForProductWithOtherCartLines(
  items,
  productId,
  stock,
  hintSpecialPattyGrams
) {
  const pid = String(productId || "");
  const patties =
    pid === SPECIAL_CHEESE_BOMB_ID
      ? [120, 120]
      : pid.startsWith("special-") && PATTIES_BY_PRODUCT_ID[pid]
        ? [Number(hintSpecialPattyGrams) === 220 ? 220 : 200]
        : PATTIES_BY_PRODUCT_ID[pid];
  if (!patties || !stock || typeof stock !== "object") return null;

  const others = (Array.isArray(items) ? items : []).filter(
    (it) => String(cartLineProductId(it) || "") !== pid
  );
  const { counts: reserved } = aggregatePattyCountsFromOrderItems(others);

  /** @type {Record<number, number>} */
  const needPer = { 120: 0, 160: 0, 200: 0, 220: 0 };
  for (const g of patties) {
    needPer[g] = (needPer[g] || 0) + 1;
  }

  let max = Infinity;
  for (const g of PATTY_GRAMS_ORDER) {
    const n = needPer[g] || 0;
    if (n <= 0) continue;
    const avail = Math.max(
      0,
      (Number(stock[g]) || 0) - (Number(reserved[g]) || 0)
    );
    max = Math.min(max, Math.floor(avail / n));
  }
  if (!Number.isFinite(max)) return 0;
  return Math.max(0, max);
}

/**
 * סכום כמויות בעגלה לשורות עם אותו productId (לפי אובייקטי { productId, quantity }).
 * @param {unknown[]} items
 * @param {string} productId
 */
export function sumQuantityForProductInItems(items, productId) {
  const pid = String(productId || "");
  if (!Array.isArray(items) || !pid) return 0;
  let s = 0;
  for (const it of items) {
    const id = String(cartLineProductId(it) || "");
    if (id !== pid) continue;
    s += Math.max(1, Number(it.quantity) || 1);
  }
  return s;
}

/**
 * @param {Record<number, number>} counts
 * @param {Record<number, number>} stock
 * @returns {{ g: number, need: number, have: number, missing: number }[]}
 */
export function computePattyShortfalls(counts, stock) {
  const out = [];
  for (const g of PATTY_GRAMS_ORDER) {
    const need = Number(counts[g]) || 0;
    const have = Number(stock[g]) || 0;
    if (need > have) {
      out.push({ g, need, have, missing: need - have });
    }
  }
  return out;
}

/**
 * שורות עגלה שמכילות לפחות קציצה במשקל שנמצא במחסור (לפי סכימה כוללת).
 * @param {unknown[]} items
 * @param {Iterable<number>} deficientGrams
 * @returns {{ productId: string, name: string, quantity: number }[]}
 */
export function collectPattyAffectedLines(items, deficientGrams) {
  const gramSet =
    deficientGrams instanceof Set ? deficientGrams : new Set(deficientGrams);
  const rows = [];
  if (!Array.isArray(items)) return rows;
  for (const it of items) {
    const pid = String(cartLineProductId(it) || "");
    const patties = pattyGramsArrayForOrderItem(it);
    if (!patties) continue;
    if (!patties.some((g) => gramSet.has(g))) continue;
    const q = Math.max(1, Number(it.quantity) || 1);
    const name =
      typeof it.name === "string" && it.name.trim() ? it.name.trim() : pid;
    rows.push({ productId: pid, name, quantity: q });
  }
  return rows;
}

export { PATTY_GRAMS_ORDER };
