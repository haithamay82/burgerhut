/** בחירת צ'יפס/תוספת למנה — בורגרים, קריספי, מיוחדים */

export const MEAL_FRIES_DEFAULT_ID = "meal-fries-regular";

/** @type {{ id: string, price: number }[]} */
export const MEAL_FRIES_OPTIONS = [
  { id: "meal-fries-none", price: 0 },
  { id: "meal-fries-regular", price: 0 },
  { id: "meal-fries-mix", price: 2 },
  { id: "meal-fries-onion-rings", price: 3 },
  { id: "meal-fries-potato-balls", price: 3 },
  { id: "meal-fries-potato", price: 3 },
];

const IDS = new Set(MEAL_FRIES_OPTIONS.map((o) => o.id));

/** @param {string} id */
export function mealFriesExtraPrice(id) {
  const row = MEAL_FRIES_OPTIONS.find((o) => o.id === id);
  return row ? row.price : 0;
}

/** @param {string} id */
export function isValidMealFriesChoiceId(id) {
  return IDS.has(String(id || "").trim());
}

/** @param {string} id */
export function mealFriesI18nSuffix(id) {
  const s = String(id || "").trim();
  if (!s || !IDS.has(s)) return "regular";
  return s.replace(/^meal-fries-/, "") || "regular";
}

/** @param {string} id */
export function normalizeMealFriesChoiceId(id) {
  const s = String(id || "").trim();
  return IDS.has(s) ? s : MEAL_FRIES_DEFAULT_ID;
}
