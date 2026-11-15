/**
 * שחרור הזמנה דחויה + Web Push למנהלים.
 * @param {{ orderRowId?: string, orderNumber?: string|number, adminPushConfirmSecret?: string }} p
 * @returns {Promise<{ ok: boolean, already?: boolean, pushOk?: boolean }>}
 */
export async function fireDeferredAdminPushNotify(p) {
  if (typeof window === "undefined") {
    return { ok: false };
  }
  const orderId = String(p?.orderRowId || "").trim();
  const orderNumber =
    p?.orderNumber != null && String(p.orderNumber).trim() !== ""
      ? String(p.orderNumber).trim()
      : "";
  const adminPushConfirmSecret = String(p?.adminPushConfirmSecret || "").trim();
  if (!orderId || !orderNumber || !adminPushConfirmSecret) {
    return { ok: false };
  }
  try {
    const r = await fetch("/api/orders/notify-admin-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        orderNumber,
        adminPushConfirmSecret,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false };
    return {
      ok: true,
      already: Boolean(d.already),
      pushOk: Boolean(d.already) || d.pushOk === true,
    };
  } catch {
    return { ok: false };
  }
}

/**
 * אחרי לחיצה על ווטסאפ — חשיפת קופון מוסתר בממשק מנהל (אם רלוונטי).
 * @param {{ orderRowId?: string }} p
 */
export function fireCouponRevealAfterWhatsAppCompose(p) {
  if (typeof window === "undefined") return;
  const orderId = String(p?.orderRowId || "").trim();
  if (!orderId) return;
  void fetch("/api/orders/reveal-coupon-after-wa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  }).catch(() => {});
}
