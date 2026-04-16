import { t } from "@/utils/i18n";

/**
 * תיאור המנה מתפריט המיוחדים (כמו במסך התפריט) — להודעות הזמנה.
 * @param {"he" | "ar"} locale
 * @param {string} productId
 * @returns {string}
 */
export function specialBurgerMenuDescription(locale, productId) {
  const pid = String(productId || "").trim();
  if (!pid.startsWith("special-")) return "";
  const key = `menu.${pid}.desc`;
  const s = t(locale, key);
  if (!s || s === key) return "";
  return String(s).trim();
}
