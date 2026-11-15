import { broadcastNewOrderToAdmins } from "@/lib/adminPushNotify";
import { revealCouponForOrderRowAfterWaSent } from "@/lib/couponAdminVisibility";
import {
  findOrderById,
  markDeferredAdminPushNotified,
  releaseDeferredAdminOrder,
} from "@/lib/ordersStore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { orderId, orderNumber, adminPushConfirmSecret } = req.body || {};
  const orderRowId = String(orderId || "").trim();
  const result = await releaseDeferredAdminOrder(
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

  if (result.already || !result.needsPush) {
    return res.status(200).json({ ok: true, already: true });
  }

  let couponCode;
  let couponDiscountNis;
  /** @type {unknown[]|undefined} */
  let orderItems;
  try {
    const order = await findOrderById(orderRowId);
    if (order?.customer && typeof order.customer === "object") {
      couponCode = order.customer.couponCode;
      couponDiscountNis = order.customer.couponDiscountNis;
    }
    if (Array.isArray(order?.items)) {
      orderItems = order.items;
    }
  } catch {
    /* ignore */
  }

  let pushOk = false;
  try {
    const pushResult = await broadcastNewOrderToAdmins({
      orderNumber: result.orderNumber,
      couponCode,
      couponDiscountNis,
      items: orderItems,
    });
    pushOk =
      Boolean(pushResult?.ok) ||
      pushResult?.error === "no_subscriptions" ||
      pushResult?.error === "vapid_not_configured";
  } catch (e) {
    console.warn("[adminPush] deferred broadcast failed", e?.message || e);
  }

  // Mark after attempt so retries can re-broadcast when pushOk is false.
  if (pushOk) {
    try {
      await markDeferredAdminPushNotified(orderRowId, result.orderNumber);
    } catch (e) {
      console.warn("[adminPush] mark notified failed", e?.message || e);
    }
  }

  return res.status(200).json({
    ok: true,
    already: false,
    pushOk,
    // Order is already visible to kitchen via adminReleasedAt even if pushOk is false.
    released: true,
  });
}
