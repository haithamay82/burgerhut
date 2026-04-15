import { mealSaladChoicesForCategory, DEFAULT_BURGER_DONENESS_ID } from "@/utils/menuData";
import { menuItemName } from "@/utils/menuItemLabels";

/** סלטים שמגיעים כברירת מחדל במנה (לפי תיאור המנה) — הלקוח יכול לשנות רק אותם */
export const SPECIAL_PRODUCT_DEFAULT_SALADS = {
  "special-truffle-king": ["salad_lettuce", "salad_onion"],
  "special-bbq-smoke": ["salad_pickles", "salad_lettuce"],
  "special-fire-burger": ["salad_lettuce", "salad_tomato"],
  "special-cheese-bomb": [
    "salad_lettuce",
    "salad_tomato",
    "salad_onion",
    "salad_pickles",
  ],
  "special-lamb-bacon-deluxe": ["salad_lettuce", "salad_tomato"],
  "special-corned-beef-stack": ["salad_pickles", "salad_onion", "salad_lettuce"],
};

/** @param {string} productId */
export function defaultSaladsForSpecialProductId(productId) {
  const list = SPECIAL_PRODUCT_DEFAULT_SALADS[productId];
  return Array.isArray(list) ? [...list] : [];
}

/** @param {string[]} selectedSaladIds */
export function mapSaladIdsToCartSalads(selectedSaladIds, menuCategory, t) {
  const saladChoices = mealSaladChoicesForCategory(menuCategory);
  return selectedSaladIds.map((id) => ({
    id,
    label: t(`salad.${id}`),
    price: Number(saladChoices.find((r) => r.id === id)?.price) || 0,
  }));
}

/**
 * שורת עגלה למנת מיוחדים — בלי תוספות מחויבות, בלי רטבים נוספים, רק סלטים + מחיר בסיס.
 * @param {{ item: object, selectedSaladIds: string[], quantity: number, t: Function, locale: string, burgerDoneness?: { id: string, label: string } | null }} p
 */
export function buildSpecialBurgerCartLine({
  item,
  selectedSaladIds,
  quantity,
  t,
  locale,
  burgerDoneness = null,
}) {
  const salads = mapSaladIdsToCartSalads(
    selectedSaladIds,
    item.category,
    t
  );
  const saladsPrice = salads.reduce(
    (s, x) => s + (Number(x.price) || 0),
    0
  );
  const base = Number(item.basePrice) || 0;
  const unitPrice = base + saladsPrice;
  const q = Math.max(1, Number(quantity) || 1);
  const don =
    burgerDoneness && String(burgerDoneness.id || "").trim()
      ? burgerDoneness
      : {
          id: DEFAULT_BURGER_DONENESS_ID,
          label: t(`ui.doneness.${DEFAULT_BURGER_DONENESS_ID}`),
        };
  return {
    productId: item.id,
    name: menuItemName(item, t, locale),
    menuCategory: item.category,
    salads,
    toppings: [],
    extras: [],
    quantity: q,
    price: unitPrice,
    burgerDoneness: don,
    specialPattyGrams: 200,
  };
}
