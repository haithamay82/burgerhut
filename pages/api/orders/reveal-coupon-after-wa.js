import { revealCouponForOrderRowAfterWaSent } from "@/lib/couponAdminVisibility";

/**
 * אחרי שליחת טקסט ההזמנה בווטסאפ — חשיפת קופון (אם היה מוסתר) בלי תלות ב-deferAdminPush.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const { orderId } = req.body || {};
  const id = String(orderId || "").trim();
  if (!id) {
    return res.status(400).json({ ok: false, error: "missing_order_id" });
  }
  try {
    await revealCouponForOrderRowAfterWaSent(id);
  } catch (e) {
    console.warn("[reveal-coupon-after-wa]", e?.message || e);
  }
  return res.status(200).json({ ok: true });
}
