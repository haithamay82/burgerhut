/** בחירת מטוגנים/תוספת למנה — בורגרים, קריספי, מיוחדים */

/** ערך מצב לפני בחירה — לא נשמר בעגלה */
export const MEAL_FRIES_UNSELECTED = "";

/** ברירת מחדל לשחזור שורות ישנות בלי שדה מטוגנים */
export const MEAL_FRIES_DEFAULT_ID = "meal-fries-regular";

/** @type {{ id: string, price: number }[]} */
export const MEAL_FRIES_OPTIONS = [
  { id: "meal-fries-none", price: 0 },
  { id: "meal-fries-regular", price: 0 },
  { id: "meal-fries-onion-rings", price: 3 },
  { id: "meal-fries-potato-balls", price: 3 },
  { id: "meal-fries-potato", price: 3 },
  { id: "meal-fries-mix", price: 2 },
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

/**
 * שחזור בחירת מטוגנים משורת עגלה שמורה (שורות ישנות בלי שדה → צ'יפס רגיל).
 * @param {unknown} raw
 */
export function coercePersistedMealFriesChoiceId(raw) {
  const s = String(raw ?? "").trim();
  return isValidMealFriesChoiceId(s) ? s : MEAL_FRIES_DEFAULT_ID;
}
