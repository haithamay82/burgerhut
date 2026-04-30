import { mealSaladChoicesForCategory, DEFAULT_BURGER_DONENESS_ID } from "@/utils/menuData";
import { menuItemName } from "@/utils/menuItemLabels";
import { canBuildBurgerWithPattyStock } from "@/utils/burgerPattyPrep";
import {
  MEAL_FRIES_DEFAULT_ID,
  mealFriesExtraPrice,
  mealFriesI18nSuffix,
} from "@/utils/mealFriesChoices";

/** תוספת מחיר לקציצת 220 גר׳ במנות מיוחדות */
export const SPECIAL_PATTY_220_EXTRA_NIS = 5;

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

/**
 * משקל קציצה ברירת מחדל למנה מיוחדת לפי מלאי (אם אין 200 — 220).
 * @param {string} productId
 * @param {Record<number, number> | null | undefined} pattyStock
 */
export function specialPattyGramsDefaultForStock(productId, pattyStock) {
  const pid = String(productId || "");
  if (pid === "special-cheese-bomb") return 200;
  if (!pattyStock || typeof pattyStock !== "object") return 200;
  const ok200 = canBuildBurgerWithPattyStock(pattyStock, pid, 1, 200);
  const ok220 = canBuildBurgerWithPattyStock(pattyStock, pid, 1, 220);
  if (ok200) return 200;
  if (ok220) return 220;
  return 200;
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
 * @param {{ item: object, selectedSaladIds: string[], quantity: number, t: Function, locale: string, burgerDoneness?: { id: string, label: string } | null, pattyStock?: Record<number, number> | null }} p
 */
export function buildSpecialBurgerCartLine({
  item,
  selectedSaladIds,
  quantity,
  t,
  locale,
  burgerDoneness = null,
  pattyStock = null,
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
  const chosenGrams =
    item.id === "special-cheese-bomb"
      ? null
      : specialPattyGramsDefaultForStock(item.id, pattyStock);
  const pattyExtra =
    chosenGrams === 220 ? SPECIAL_PATTY_220_EXTRA_NIS : 0;
  const mealFriesChoiceId = MEAL_FRIES_DEFAULT_ID;
  const mealFriesPrice = mealFriesExtraPrice(mealFriesChoiceId);
  const mealFriesLabel = t(`ui.mealFries.${mealFriesI18nSuffix(mealFriesChoiceId)}`);
  const unitPrice = base + saladsPrice + pattyExtra + mealFriesPrice;
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
    mealFriesChoiceId,
    mealFriesLabel,
    mealFriesPrice,
    ...(chosenGrams != null ? { specialPattyGrams: chosenGrams } : {}),
  };
}
