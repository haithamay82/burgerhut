import { cancelOrderByCustomer } from "@/lib/ordersStore";

/**
 * Public: customer cancels a cash order within the 60s pending window.
 * Body: { orderId, cancelSecret }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const orderId = String(req.body?.orderId || "").trim();
  const cancelSecret = String(req.body?.cancelSecret || "").trim();
  if (!orderId || !cancelSecret) {
    return res.status(400).json({ ok: false, error: "invalid_params" });
  }

  const result = await cancelOrderByCustomer({ orderId, cancelSecret });
  if (!result.ok) {
    const map = {
      not_found: 404,
      unauthorized: 403,
      cancel_window_closed: 409,
      not_cash: 400,
    };
    const status = map[result.error] || 400;
    return res.status(status).json({ ok: false, error: result.error });
  }

  return res.status(200).json({
    ok: true,
    fulfillment: result.order?.fulfillment || null,
  });
}
