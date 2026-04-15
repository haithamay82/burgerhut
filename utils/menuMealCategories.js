/**
 * קטגוריות עם וויזארד מנה מלא (סלטים, תוספות בורגר, רטבים, מידת עשייה לבקר וכו׳).
 * @type {ReadonlySet<string>}
 */
export const MEAL_WIZARD_CATEGORY_IDS = new Set([
  "burgers",
  "crispy",
  "specials",
]);

/**
 * בורגר בקר (לא קריספי) — מידת עשייה, מלאי קציצות ותוספות כמו בורגר רגיל.
 * @type {ReadonlySet<string>}
 */
export const BEEF_BURGER_STYLE_CATEGORY_IDS = new Set(["burgers", "specials"]);

/** @param {unknown} category */
export function isMealWizardCategory(category) {
  return MEAL_WIZARD_CATEGORY_IDS.has(String(category || ""));
}

/** @param {unknown} category */
export function isBeefBurgerStyleCategory(category) {
  return BEEF_BURGER_STYLE_CATEGORY_IDS.has(String(category || ""));
}
