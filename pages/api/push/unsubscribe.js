import {
  removeCustomerPushSubscriptionByEndpoint,
  removeCustomerPushSubscriptionByPushClientId,
} from "@/lib/customerPushSubscriptions";
import { isValidPushClientId } from "@/utils/customerPushClientId";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const endpoint = String(req.body?.endpoint || "").trim();
  const pushClientId = String(req.body?.pushClientId || "").trim();
  if (isValidPushClientId(pushClientId)) {
    await removeCustomerPushSubscriptionByPushClientId(pushClientId);
  }
  if (endpoint) {
    await removeCustomerPushSubscriptionByEndpoint(endpoint);
  }
  return res.status(200).json({ ok: true });
}
