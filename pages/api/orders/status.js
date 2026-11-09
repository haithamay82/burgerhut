import {
  decorateOrderFulfillment,
  findOrderByOrderNumber,
  syncOrderFulfillmentById,
} from "@/lib/ordersStore";
import { notifyCustomerOrderFulfillmentPush } from "@/lib/customerPushNotify";
import { resolveFulfillment } from "@/utils/orderFulfillment";

/**
 * Public order fulfillment status for the customer success screen.
 * Query: ?on=5001 (order number)
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const raw = req.query?.on;
  const on =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw)
        ? String(raw[0] || "").trim()
        : "";
  if (!on || !/^\d{3,8}$/.test(on)) {
    return res.status(400).json({ ok: false, error: "invalid_order_number" });
  }

  res.setHeader(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0"
  );

  const found = await findOrderByOrderNumber(on);
  if (!found) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  let order = found;
  const sync = await syncOrderFulfillmentById(String(found.id));
  if (sync.ok && sync.order) {
    order = sync.order;
    if (sync.notifyEvent) {
      try {
        await notifyCustomerOrderFulfillmentPush({
          order,
          event: sync.notifyEvent,
        });
      } catch (e) {
        console.warn(
          "[customerPush] auto-ready notify failed",
          e?.message || e
        );
      }
    }
  } else {
    order = decorateOrderFulfillment(found);
  }

  const fulfillment = resolveFulfillment(order);
  return res.status(200).json({
    ok: true,
    orderNumber: order.orderNumber,
    fulfillment: {
      status: fulfillment.status,
      prepMinutes: fulfillment.prepMinutes,
      prepEndsAt: fulfillment.prepEndsAt,
      acceptedAt: fulfillment.acceptedAt,
      rejectedAt: fulfillment.rejectedAt,
      readyAt: fulfillment.readyAt,
      deliveredAt: fulfillment.deliveredAt,
    },
  });
}
