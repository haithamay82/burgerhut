import { cartLineProductId } from "@/hooks/useCart";

/**
 * מיפוי מנה (בורגר בלבד) → משקלי קציצות בגרמים לפי טבלת המטבח.
 * 600ג׳: ברירת מחדל 3×200; קיימת חלופה 220+220+160 — מוצגת בהערה בניהול.
 */
export const PATTIES_BY_PRODUCT_ID = {
  "kids-burger-120": [120],
  "burger-160": [160],
  "burger-200": [200],
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
    const patties = PATTIES_BY_PRODUCT_ID[pid];
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
export function canBuildBurgerWithPattyStock(stock, pid, qty) {
  const patties = PATTIES_BY_PRODUCT_ID[pid];
  if (!patties) return true;
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
  return Object.keys(PATTIES_BY_PRODUCT_ID).filter(
    (pid) => !canBuildBurgerWithPattyStock(stock, pid, 1)
  );
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

export { PATTY_GRAMS_ORDER };
