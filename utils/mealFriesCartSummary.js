import { safeQty } from "@/utils/cartMoney";
import { isMealWizardCategory } from "@/utils/menuMealCategories";
import { normalizeMealFriesChoicesFromLine } from "@/utils/mealFriesChoices";

/**
 * סיכום בחירות «מטוגנים למנה» בעגלה (לפי תווית כפי שנשמרה בשורה).
 * @param {unknown[]} items
 * @param {"he"|"ar"} [sortLocale]
 * @returns {{ key: string, label: string, qty: number }[]}
 */
export function aggregateMealFriesCartSummary(items, sortLocale = "he") {
  if (!Array.isArray(items)) return [];
  const acc = new Map();
  for (const line of items) {
    const cat = String(line?.menuCategory || "").trim();
    if (!isMealWizardCategory(cat)) continue;
    const choices = normalizeMealFriesChoicesFromLine(line);
    if (!choices.length) continue;
    const qty = safeQty(line);
    for (const c of choices) {
      const key = c.id;
      const label = String(c.label || "").trim() || key;
      const cur = acc.get(key);
      if (cur) {
        cur.qty += qty;
      } else {
        acc.set(key, { key, label, qty });
      }
    }
  }
  const loc = sortLocale === "ar" ? "ar" : "he";
  return [...acc.values()].sort((a, b) =>
    a.label.localeCompare(b.label, loc, { sensitivity: "base" })
  );
}
