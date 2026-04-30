import { safeQty } from "@/utils/cartMoney";
import { isMealWizardCategory } from "@/utils/menuMealCategories";

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
    const choiceId = String(line?.mealFriesChoiceId || "").trim();
    const label = String(line?.mealFriesLabel || "").trim();
    if (!choiceId && !label) continue;
    const key = choiceId || label;
    const qty = safeQty(line);
    const displayLabel = label || choiceId;
    const cur = acc.get(key);
    if (cur) {
      cur.qty += qty;
    } else {
      acc.set(key, { key, label: displayLabel, qty });
    }
  }
  const loc = sortLocale === "ar" ? "ar" : "he";
  return [...acc.values()].sort((a, b) =>
    a.label.localeCompare(b.label, loc, { sensitivity: "base" })
  );
}
