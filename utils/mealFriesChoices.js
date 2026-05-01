/** בחירת מטוגנים/תוספת למנה — בורגרים, קריספי, מיוחדים (בחירה מרובת) */

/** ערך מצב לפני בחירה — לא נשמר בעגלה */
export const MEAL_FRIES_UNSELECTED = "";

/** ברירת מחדל לשחזור שורות ישנות בלי שדה מטוגנים */
export const MEAL_FRIES_DEFAULT_ID = "meal-fries-regular";

export const MEAL_FRIES_NONE_ID = "meal-fries-none";

export const MEAL_FRIES_REGULAR_ID = "meal-fries-regular";

export const MEAL_FRIES_MIX_ID = "meal-fries-mix";

/** מחיר צ'יפס כשמיקס הבית גם מסומן */
export const MEAL_FRIES_REGULAR_WITH_MIX_PRICE = 15;

/** מחיר מיקס הבית כשצ'יפס גם מסומן */
export const MEAL_FRIES_MIX_WITH_REGULAR_PRICE = 18;

/** תמונות כמו פריטי sides בתפריט — מיקס הבית מיד אחרי צ'יפס */
/** @type {{ id: string, price: number, image: string | null }[]} */
export const MEAL_FRIES_OPTIONS = [
  { id: "meal-fries-none", price: 0, image: null },
  { id: "meal-fries-regular", price: 0, image: "/menu/side-fries.png" },
  { id: "meal-fries-mix", price: 2, image: "/menu/side-mix.png" },
  { id: "meal-fries-onion-rings", price: 18, image: "/menu/side-onion-rings.png" },
  { id: "meal-fries-potato-balls", price: 18, image: "/menu/side-mashed-balls.png" },
  { id: "meal-fries-potato", price: 18, image: "/menu/side-sweet-potato.png" },
  {
    id: "meal-fries-chips-cheddar-symphony",
    price: 25,
    image: "/menu/side-chips-cheddar-symphony.png",
  },
  {
    id: "meal-fries-mozzarella-sticks",
    price: 25,
    image: "/menu/side-mozzarella-sticks.png",
  },
  { id: "meal-fries-home-fries", price: 30, image: "/menu/side-home-fries.png" },
  {
    id: "meal-fries-home-fries-spicy",
    price: 30,
    image: "/menu/side-home-fries-spicy.png",
  },
];

const IDS = new Set(MEAL_FRIES_OPTIONS.map((o) => o.id));

/** @param {string} id */
export function mealFriesExtraPrice(id) {
  const row = MEAL_FRIES_OPTIONS.find((o) => o.id === id);
  return row ? row.price : 0;
}

const MENU_ORDER_IDS = MEAL_FRIES_OPTIONS.map((o) => o.id);

/**
 * מחיר תוספת לפי בחירה — צ'יפס + מיקס משנים זה את זה.
 * @param {string} id
 * @param {string[]} selectedIds
 */
export function mealFriesEffectiveExtraPrice(id, selectedIds) {
  const ids = sortMealFriesIds(selectedIds);
  const hasRegular = ids.includes(MEAL_FRIES_REGULAR_ID);
  const hasMix = ids.includes(MEAL_FRIES_MIX_ID);
  const sid = String(id || "").trim();
  if (sid === MEAL_FRIES_REGULAR_ID) {
    return hasMix ? MEAL_FRIES_REGULAR_WITH_MIX_PRICE : 0;
  }
  if (sid === MEAL_FRIES_MIX_ID) {
    return hasRegular ? MEAL_FRIES_MIX_WITH_REGULAR_PRICE : mealFriesExtraPrice(sid);
  }
  return mealFriesExtraPrice(sid);
}

/**
 * סכום תוספת מטוגנים לפי כל הבחירה הנוכחית.
 * @param {string[]} selectedIds
 */
export function mealFriesSelectionTotalExtra(selectedIds) {
  return sortMealFriesIds(selectedIds).reduce(
    (s, id) => s + mealFriesEffectiveExtraPrice(id, selectedIds),
    0
  );
}

/**
 * מיון id לפי סדר התפריט (לתצוגה / מפתח עגלה עקבי).
 * @param {string[]} ids
 * @returns {string[]}
 */
export function sortMealFriesIdsByMenuOrder(ids) {
  const uniq = sortMealFriesIds(ids);
  const idx = (id) => {
    const i = MENU_ORDER_IDS.indexOf(id);
    return i === -1 ? 999 : i;
  };
  return [...uniq].sort((a, b) => idx(a) - idx(b) || a.localeCompare(b));
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
 * @param {unknown[]} ids
 * @returns {string[]}
 */
export function sortMealFriesIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [
    ...new Set(
      ids.map((x) => String(x ?? "").trim()).filter((x) => x && IDS.has(x))
    ),
  ].sort();
}

/**
 * @param {unknown} line
 * @returns {{ id: string, label: string, price: number }[]}
 */
export function normalizeMealFriesChoicesFromLine(line) {
  const raw = line?.mealFriesChoices;
  if (Array.isArray(raw) && raw.length > 0) {
    const seen = new Set();
    const out = [];
    for (const row of raw) {
      const id = String(row?.id ?? "").trim();
      if (!isValidMealFriesChoiceId(id) || seen.has(id)) continue;
      seen.add(id);
      const price = Number.isFinite(Number(row?.price))
        ? Number(row.price)
        : mealFriesExtraPrice(id);
      const label = String(row?.label ?? "").trim() || id;
      out.push({ id, label, price });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }
  const id = coercePersistedMealFriesChoiceId(line?.mealFriesChoiceId);
  if (!isValidMealFriesChoiceId(id)) return [];
  const price = Number.isFinite(Number(line?.mealFriesPrice))
    ? Number(line.mealFriesPrice)
    : mealFriesExtraPrice(id);
  const label = String(line?.mealFriesLabel ?? "").trim() || id;
  return [{ id, label, price }];
}

/**
 * מקטע למפתח התאמה בעגלה (ממוין לפי id).
 * @param {unknown} line
 */
export function mealFriesCustomizationKeyFromLine(line) {
  return normalizeMealFriesChoicesFromLine(line)
    .map((c) => c.id)
    .join(",");
}

/**
 * @param {string[]} ids
 */
export function hasMealFriesSelection(ids) {
  const sorted = sortMealFriesIds(ids);
  return sorted.length > 0;
}

/**
 * @param {string[]} prev
 * @param {string} id
 * @returns {string[]}
 */
export function toggleMealFriesIdInSelection(prev, id) {
  const cur = sortMealFriesIds(prev);
  if (!isValidMealFriesChoiceId(id)) return cur;
  if (id === MEAL_FRIES_NONE_ID) {
    if (cur.includes(MEAL_FRIES_NONE_ID)) return [];
    return [MEAL_FRIES_NONE_ID];
  }
  const next = new Set(cur);
  next.delete(MEAL_FRIES_NONE_ID);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return sortMealFriesIds([...next]);
}

/**
 * שחזור בחירת מטוגנים משורת עגלה שמורה (שורות ישנות בלי שדה → צ'יפס רגיל).
 * @param {unknown} raw
 */
export function coercePersistedMealFriesChoiceId(raw) {
  const s = String(raw ?? "").trim();
  return isValidMealFriesChoiceId(s) ? s : MEAL_FRIES_DEFAULT_ID;
}
