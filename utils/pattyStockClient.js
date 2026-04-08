import { cartLineProductId, customizationKey } from "@/hooks/useCart";

/**
 * מדמה את העגלה אחרי הוספת שורה (כולל מיזוג לפי customizationKey).
 * @param {object[]} cartItems
 * @param {object} newLine — אותו אובייקט שמועבר ל־addItem
 * @returns {object[]}
 */
export function simulateCartAfterAdd(cartItems, newLine) {
  const inc = Math.max(1, Number(newLine.quantity) || 1);
  const pid =
    cartLineProductId(newLine) ||
    (typeof newLine.productId === "string" ? newLine.productId : "");
  const keyed = { ...newLine, productId: pid, quantity: inc };
  const key = customizationKey(keyed);
  const next = cartItems.map((row) => ({ ...row }));
  const idx = next.findIndex((row) => customizationKey(row) === key);
  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      quantity: Math.max(1, Number(next[idx].quantity) || 1) + inc,
    };
    return next;
  }
  return [...next, keyed];
}

/**
 * בודק מול השרת אם מלאי הקציצות מספיק לכל השורות (אחרי מיזוג).
 * @param {object[]} lines — תוצאת simulateCartAfterAdd
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function validatePattyStockForSimulatedCart(lines) {
  const items = lines.map((it) => ({
    productId: cartLineProductId(it),
    quantity: Math.max(1, Number(it.quantity) || 1),
  }));
  try {
    const r = await fetch("/api/inventory/validate-patties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: "network" };
    if (d.skipped) return { ok: true };
    return d.ok ? { ok: true } : { ok: false, error: "insufficient_patties" };
  } catch {
    return { ok: false, error: "network" };
  }
}
