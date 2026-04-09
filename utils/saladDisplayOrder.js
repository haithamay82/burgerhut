import { FREE_SALADS } from "@/utils/menuData";

/** סדר תצוגה קבוע: חסה → עגבניה → חמוצים → בצל (כמו FREE_SALADS) */
const SALAD_IDS_ORDER = FREE_SALADS.map((s) => s.id);
const ORDER_SET = new Set(SALAD_IDS_ORDER);

/**
 * מחזיר רק סלטים שנבחרו, בסדר התפריט (לא לפי סדר הבחירה).
 * @param {{ id: string, label?: string }[] | null | undefined} salads
 */
export function sortSaladsForDisplay(salads) {
  if (!Array.isArray(salads) || !salads.length) return [];
  const byId = new Map(
    salads.map((s) => [String(s?.id || "").trim(), s]).filter(([id]) => id)
  );
  const out = [];
  for (const id of SALAD_IDS_ORDER) {
    const row = byId.get(id);
    if (row) out.push(row);
  }
  for (const s of salads) {
    const id = String(s?.id || "").trim();
    if (id && !ORDER_SET.has(id)) out.push(s);
  }
  return out;
}
