/**
 * תאימות לאחור: הזמנות ישנות עם deferAdminPush — אישור Web Push אחרי ווטסאפ.
 * @param {{ orderRowId?: string, orderNumber?: string|number, adminPushConfirmSecret?: string }} p
 */
export function fireDeferredAdminPushNotify(p) {
  if (typeof window === "undefined") return;
  const orderId = String(p?.orderRowId || "").trim();
  const orderNumber =
    p?.orderNumber != null && String(p.orderNumber).trim() !== ""
      ? String(p.orderNumber).trim()
      : "";
  const adminPushConfirmSecret = String(p?.adminPushConfirmSecret || "").trim();
  if (!orderId || !orderNumber || !adminPushConfirmSecret) return;
  void fetch("/api/orders/notify-admin-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId,
      orderNumber,
      adminPushConfirmSecret,
    }),
  }).catch(() => {});
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
