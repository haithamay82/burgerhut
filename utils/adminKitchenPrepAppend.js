import {
  aggregatePattyCountsFromOrderItems,
  hasAnyPattyPrep,
  PATTY_GRAMS_ORDER,
} from "@/utils/burgerPattyPrep";
import { aggregateMealFriesCartSummary } from "@/utils/mealFriesCartSummary";

/**
 * @param {unknown} row
 * @returns {string}
 */
function prepRowKey(row) {
  const id = String(row?.id ?? "").trim();
  const layers = Number(row?.layers) === 2 ? 2 : 1;
  if (id) return `${id}:${layers}`;
  const lab = String(row?.label ?? row?.name ?? "").trim();
  return `l:${lab}:${layers}`;
}

/**
 * @param {unknown} row
 * @returns {string}
 */
function prepRowLabel(row) {
  return (
    String(row?.label ?? row?.name ?? "").trim() ||
    String(row?.id ?? "").trim()
  );
}

/**
 * סיכום תוספות על מנות או רטבים בצד — לפי כל שורות ההזמנה (כמות שורה × פריטים במנה).
 * @param {unknown[]} items
 * @param {'toppings'|'extras'} field
 * @param {'he'|'ar'} [sortLocale]
 * @returns {{ label: string, count: number }[]}
 */
export function aggregatePrepRowsForAdmin(items, field, sortLocale = "he") {
  /** @type {Map<string, { label: string, count: number }>} */
  const m = new Map();
  const loc = sortLocale === "ar" ? "ar" : "he";
  if (!Array.isArray(items)) return [];
  for (const it of items) {
    const q = Math.max(1, Number(it?.quantity) || 1);
    const arr = it?.[field];
    if (!Array.isArray(arr) || !arr.length) continue;
    for (const row of arr) {
      const label = prepRowLabel(row);
      if (!label) continue;
      const key = prepRowKey(row);
      const cur = m.get(key);
      m.set(key, { label, count: (cur?.count || 0) + q });
    }
  }
  return [...m.values()]
    .filter((v) => v.count > 0)
    .sort((a, b) => a.label.localeCompare(b.label, loc));
}

/**
 * קציצות + תוספות למנות + רטבים בצד — טקסט להוספה להתראות ניהול (אחרי רשימת פריטים).
 * @param {(key: string) => string} tr
 * @param {unknown[]} items
 * @param {'he'|'ar'} [sortLocale]
 * @returns {string}
 */
export function buildAdminKitchenPrepPlainSuffix(tr, items, sortLocale = "he") {
  const list = Array.isArray(items) ? items : [];
  const chunks = [];

  const prep = aggregatePattyCountsFromOrderItems(list);
  if (hasAnyPattyPrep(prep)) {
    let block = tr("admin.pattyPrepTitle");
    for (const g of PATTY_GRAMS_ORDER) {
      const n = prep.counts[g] || 0;
      if (n <= 0) continue;
      block +=
        "\n" +
        tr("admin.pattyPrepLine").replace("{n}", String(n)).replace("{g}", String(g));
    }
    if (prep.qty600 > 0) {
      block +=
        "\n" +
        tr("admin.pattyPrep600Note").replace("{n}", String(prep.qty600));
    }
    chunks.push(block);
  }

  const friesRows = aggregateMealFriesCartSummary(list, sortLocale);
  if (friesRows.length) {
    const lines = friesRows.map((r) =>
      tr("admin.prepAggLine")
        .replace("{n}", String(r.qty))
        .replace("{label}", r.label)
    );
    chunks.push(
      `${tr("checkout.mealFriesCartSummaryTitle")}\n${lines.join("\n")}`
    );
  }

  const topRows = aggregatePrepRowsForAdmin(list, "toppings", sortLocale);
  if (topRows.length) {
    const lines = topRows.map((r) =>
      tr("admin.prepAggLine")
        .replace("{n}", String(r.count))
        .replace("{label}", r.label)
    );
    chunks.push(`${tr("admin.prepMealToppingsTitle")}\n${lines.join("\n")}`);
  }

  const exRows = aggregatePrepRowsForAdmin(list, "extras", sortLocale);
  if (exRows.length) {
    const lines = exRows.map((r) =>
      tr("admin.prepAggLine")
        .replace("{n}", String(r.count))
        .replace("{label}", r.label)
    );
    chunks.push(`${tr("admin.prepSideExtrasTitle")}\n${lines.join("\n")}`);
  }

  if (!chunks.length) return "";
  return `\n\n${chunks.join("\n\n")}`;
}
