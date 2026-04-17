import { broadcastNewOrderToAdmins } from "@/lib/adminPushNotify";
import { revealCouponForOrderRowAfterWaSent } from "@/lib/couponAdminVisibility";
import {
  completeDeferredAdminPush,
  findOrderById,
} from "@/lib/ordersStore";

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

  let couponCode;
  let couponDiscountNis;
  try {
    const order = await findOrderById(orderRowId);
    if (order?.customer && typeof order.customer === "object") {
      couponCode = order.customer.couponCode;
      couponDiscountNis = order.customer.couponDiscountNis;
    }
  } catch {
    /* ignore */
  }

  try {
    await broadcastNewOrderToAdmins({
      orderNumber: result.orderNumber,
      couponCode,
      couponDiscountNis,
    });
  } catch (e) {
    console.warn("[adminPush] deferred broadcast failed", e?.message || e);
  }

  return res.status(200).json({ ok: true });
}
