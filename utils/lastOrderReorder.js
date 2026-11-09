/** הזמנה אחרונה במכשיר — להצעת «הזמן שוב» */
export const LAST_ORDER_LS_KEY = "bh_last_order_v1";
export const LAST_ORDER_PROMPT_DISMISS_SS = "bh_last_order_prompt_dismiss_v1";

const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * @param {unknown} items
 * @returns {object[]}
 */
export function sanitizeCartItemsForReorder(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const productId =
      String(raw.productId || "").trim() ||
      (typeof raw.id === "string" && raw.id.includes(":")
        ? raw.id.split(":")[0]
        : String(raw.id || "").trim());
    const name = String(raw.name || "").trim();
    if (!productId || !name) continue;
    out.push({
      ...raw,
      productId,
      name,
      quantity: Math.max(1, Number(raw.quantity) || 1),
    });
  }
  return out;
}

/**
 * @param {{ items: unknown, orderNumber?: unknown, total?: unknown }} p
 */
export function saveLastOrderForReorder(p) {
  if (typeof window === "undefined") return;
  const items = sanitizeCartItemsForReorder(p?.items);
  if (!items.length) return;
  const payload = {
    v: 1,
    savedAt: Date.now(),
    orderNumber:
      p?.orderNumber != null && String(p.orderNumber).trim() !== ""
        ? String(p.orderNumber).trim()
        : null,
    total:
      Number.isFinite(Number(p?.total)) && Number(p.total) > 0
        ? Number(p.total)
        : null,
    items,
  };
  try {
    window.localStorage.setItem(LAST_ORDER_LS_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  try {
    window.sessionStorage.removeItem(LAST_ORDER_PROMPT_DISMISS_SS);
  } catch {
    /* ignore */
  }
}

/** @returns {{ items: object[], orderNumber: string | null, total: number | null, savedAt: number } | null} */
export function readLastOrderForReorder() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_ORDER_LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    const savedAt = Number(data.savedAt) || 0;
    if (!savedAt || Date.now() - savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(LAST_ORDER_LS_KEY);
      return null;
    }
    const items = sanitizeCartItemsForReorder(data.items);
    if (!items.length) return null;
    return {
      items,
      orderNumber:
        data.orderNumber != null && String(data.orderNumber).trim() !== ""
          ? String(data.orderNumber).trim()
          : null,
      total:
        Number.isFinite(Number(data.total)) && Number(data.total) > 0
          ? Number(data.total)
          : null,
      savedAt,
    };
  } catch {
    return null;
  }
}

export function dismissLastOrderReorderPrompt() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LAST_ORDER_PROMPT_DISMISS_SS, "1");
  } catch {
    /* ignore */
  }
}

export function isLastOrderReorderPromptDismissed() {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(LAST_ORDER_PROMPT_DISMISS_SS) === "1";
  } catch {
    return true;
  }
}
