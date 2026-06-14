import { cartLineProductId } from "@/hooks/useCart";
import { FREE_SALADS, MENU_ITEMS } from "@/utils/menuData";
import { isMealWizardCategory } from "@/utils/menuMealCategories";

const MENU_CATEGORY_BY_PRODUCT_ID = new Map(
  MENU_ITEMS.map((row) => [row.id, row.category])
);

/** סדר תצוגה: חסה → עגבניה → חמוצים → בצל → קולסלאו (אם נבחר) */
const SALAD_IDS_ORDER = [
  ...FREE_SALADS.map((s) => s.id),
  "salad_coleslaw",
];
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

function cartLineMenuCategory(item) {
  const pid = String(cartLineProductId(item) || "").trim();
  if (pid && MENU_CATEGORY_BY_PRODUCT_ID.has(pid)) {
    return MENU_CATEGORY_BY_PRODUCT_ID.get(pid);
  }
  const field = String(item?.menuCategory || "").trim().toLowerCase();
  if (field) return field;
  if (pid.startsWith("crispy-")) return "crispy";
  if (pid.startsWith("special-")) return "specials";
  if (
    pid.startsWith("burger-") ||
    pid.startsWith("kids-burger-") ||
    pid.startsWith("smash-burger-")
  ) {
    return "burgers";
  }
  return null;
}

/**
 * טקסט סלטים לשורת הזמנה (ניהול / ווטסאפ) — null אם הפריט לא מנה עם וויזארד.
 * @param {unknown} item
 * @param {(key: string) => string} tr
 * @returns {string|null}
 */
export function formatCartLineSaladsForOrder(item, tr) {
  if (!isMealWizardCategory(cartLineMenuCategory(item))) return null;
  const labels = sortSaladsForDisplay(item?.salads)
    .map((x) => String(x?.label || "").trim())
    .filter(Boolean);
  if (labels.length) return labels.join(", ");
  return tr("checkout.noSalads");
}
