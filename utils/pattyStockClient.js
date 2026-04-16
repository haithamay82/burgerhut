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
 * טקסט להתראה כשחסר מלאי קציצות להוספה לעגלה (לפי תקרה מול כמות שניסו).
 * @param {(k: string) => string} t
 * @param {{ error?: string, pattyCeiling?: number, pattyQtyAttempted?: number }} check
 */
export function pattyInsufficientAddToCartMessage(t, check) {
  if (check.error === "network") return t("ui.pattyStockCheckFailed");
  const c = Number(check.pattyCeiling);
  const q = Number(check.pattyQtyAttempted);
  if (
    Number.isFinite(c) &&
    Number.isFinite(q) &&
    q > c
  ) {
    if (c <= 0) {
      return t("ui.pattyInsufficientTypeExhausted");
    }
    if (c === 1) {
      return t("ui.pattyInsufficientCapOne");
    }
    return t("ui.pattyInsufficientCapMany").replace(/{max}/g, String(c));
  }
  return t("ui.pattyInsufficientForMealFallback");
}

/**
 * בודק מול השרת אם מלאי הקציצות מספיק לכל השורות (אחרי מיזוג).
 * @param {object[]} lines — תוצאת simulateCartAfterAdd
 * @param {string} [hintProductId] — מזהה מנה לחישוב תקרה/כמות לצורך הודעה
 * @returns {Promise<{ ok: boolean, error?: string, pattyCeiling?: number, pattyQtyAttempted?: number }>}
 */
export async function validatePattyStockForSimulatedCart(
  lines,
  hintProductId,
  hintSpecialPattyGrams
) {
  const items = lines.map((it) => {
    const pid = String(cartLineProductId(it) || "");
    const base = {
      productId: pid,
      quantity: Math.max(1, Number(it.quantity) || 1),
    };
    if (pid.startsWith("special-")) {
      if (pid === "special-cheese-bomb") {
        return { ...base };
      }
      return {
        ...base,
        specialPattyGrams: Number(it.specialPattyGrams) === 220 ? 220 : 200,
      };
    }
    return base;
  });
  const hint =
    typeof hintProductId === "string" && hintProductId.trim()
      ? hintProductId.trim()
      : undefined;
  const hintSp =
    hint && hint.startsWith("special-") && hint !== "special-cheese-bomb"
      ? Number(hintSpecialPattyGrams) === 220
        ? 220
        : 200
      : undefined;
  try {
    const r = await fetch("/api/inventory/validate-patties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        ...(hint ? { hintProductId: hint } : {}),
        ...(hint && hint.startsWith("special-")
          ? { hintSpecialPattyGrams: hintSp }
          : {}),
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: "network" };
    if (d.skipped) return { ok: true };
    if (d.ok) return { ok: true };
    const pattyCeiling = Number(d.pattyCeiling);
    const pattyQtyAttempted = Number(d.pattyQtyAttempted);
    return {
      ok: false,
      error: "insufficient_patties",
      ...(Number.isFinite(pattyCeiling) ? { pattyCeiling } : {}),
      ...(Number.isFinite(pattyQtyAttempted)
        ? { pattyQtyAttempted }
        : {}),
    };
  } catch {
    return { ok: false, error: "network" };
  }
}
