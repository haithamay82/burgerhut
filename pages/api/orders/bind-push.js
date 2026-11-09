import { bindCustomerPushClientToOrder } from "@/lib/ordersStore";
import { isValidPushClientId } from "@/utils/customerPushClientId";

/**
 * Public: bind this device's customer push id to an order for status alerts.
 * Body: { orderNumber, pushClientId }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const orderNumber = req.body?.orderNumber;
  const pushClientId = String(req.body?.pushClientId || "").trim();
  if (!isValidPushClientId(pushClientId)) {
    return res.status(400).json({ ok: false, error: "invalid_push_client_id" });
  }
  const on = Number(orderNumber);
  if (!Number.isFinite(on)) {
    return res.status(400).json({ ok: false, error: "invalid_order_number" });
  }

  const result = await bindCustomerPushClientToOrder(on, pushClientId);
  if (!result.ok) {
    if (result.error === "not_found") {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    return res.status(400).json({ ok: false, error: result.error });
  }
  return res.status(200).json({ ok: true, already: Boolean(result.already) });
}
