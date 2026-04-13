import { broadcastNewOrderToAdmins } from "@/lib/adminPushNotify";
import { revealCouponForOrderRowAfterWaSent } from "@/lib/couponAdminVisibility";
import { completeDeferredAdminPush } from "@/lib/ordersStore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { orderId, orderNumber, adminPushConfirmSecret } = req.body || {};
  const orderRowId = String(orderId || "").trim();
  const result = await completeDeferredAdminPush(
    orderId,
    orderNumber,
    adminPushConfirmSecret
  );

  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }

  try {
    await revealCouponForOrderRowAfterWaSent(orderRowId);
  } catch (e) {
    console.warn("[adminPush] coupon reveal failed", e?.message || e);
  }

  if (result.already) {
    return res.status(200).json({ ok: true, already: true });
  }

  try {
    await broadcastNewOrderToAdmins({ orderNumber: result.orderNumber });
  } catch (e) {
    console.warn("[adminPush] deferred broadcast failed", e?.message || e);
  }

  return res.status(200).json({ ok: true });
}
