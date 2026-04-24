/**
 * @param {{ id: string, nameHe?: string, nameAr?: string }} item
 * @param {(k: string) => string} t
 * @param {'he'|'ar'} locale
 */
export function menuItemName(item, t, locale) {
  if (locale === "ar" && item.nameAr) return item.nameAr;
  if (locale === "he" && item.nameHe) return item.nameHe;
  if (item.nameHe) return item.nameHe;
  if (item.nameAr) return item.nameAr;
  const key = `menu.${item.id}.name`;
  const v = t(key);
  return v === key ? item.id : v;
}

import { specialPattyGramsDefaultForStock } from "@/utils/specialBurgerDefaults";

/**
 * @param {string} text
 * @param {'he'|'ar'} locale
 */
function specialPattyOpeningPhraseWhen220Only(text, locale) {
  if (!text) return text;
  if (locale === "ar") {
    return text.includes("قرص 200غ،")
      ? text.replace("قرص 200غ،", "قرص 220غ،")
      : text;
  }
  return text.includes("קציצה 200 גרם,")
    ? text.replace("קציצה 200 גרם,", "קציצה 220 גרם,")
    : text;
}

/**
 * @param {{ id: string, category?: string, descHe?: string, descAr?: string }} item
 * @param {(k: string) => string} t
 * @param {'he'|'ar'} locale
 * @param {Record<number, number> | null | undefined} [pattyStock] — כשמוגדר, תיאור מיוחדים משקף משקל ברירת מחדל לפי מלאי
 */
export function menuItemDesc(item, t, locale, pattyStock) {
  if (locale === "ar" && item.descAr) return item.descAr;
  if (locale === "he" && item.descHe) return item.descHe;
  if (item.descHe) return item.descHe;
  if (item.descAr) return item.descAr;
  const key = `menu.${item.id}.desc`;
  const v = t(key);
  if (v === key) return "";
  if (
    pattyStock != null &&
    typeof pattyStock === "object" &&
    item?.category === "specials" &&
    item.id &&
    item.id !== "special-cheese-bomb" &&
    specialPattyGramsDefaultForStock(item.id, pattyStock) === 220
  ) {
    return specialPattyOpeningPhraseWhen220Only(v, locale);
  }
  return v;
}
