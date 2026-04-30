import { t } from "@/utils/i18n";

/**
 * כשבמנה מיוחדת נבחרה קציצת 220 גר׳ — מעדכן את תחילת תיאור המרכיבים (כמו בטקסט הקבוע של 200 גר׳).
 * @param {string} text
 * @param {"he" | "ar"} locale
 * @param {unknown} specialPattyGrams
 */
export function applySpecialPattyGramsToMealDescription(
  text,
  locale,
  specialPattyGrams
) {
  if (!text || Number(specialPattyGrams) !== 220) return text;
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
 * תיאור המנה מתפריט המיוחדים (כמו במסך התפריט) — להודעות הזמנה / מרכיבים.
 * @param {"he" | "ar"} locale
 * @param {string} productId
 * @param {unknown} [specialPattyGrams] — משורת עגלה: 220 מחליף בטקסט ל«קציצה 220 גרם»
 */
export function specialBurgerMenuDescription(
  locale,
  productId,
  specialPattyGrams
) {
  const pid = String(productId || "").trim();
  if (!pid.startsWith("special-")) return "";
  const key = `menu.${pid}.desc`;
  const s = t(locale, key);
  if (!s || s === key) return "";
  const base = String(s).trim();
  if (pid === "special-cheese-bomb") return base;
  return applySpecialPattyGramsToMealDescription(
    base,
    locale,
    specialPattyGrams
  );
}
