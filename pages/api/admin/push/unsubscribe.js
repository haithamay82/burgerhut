import {
  removeAdminPushSubscriptionByEndpoint,
  removeAdminPushSubscriptionByPushClientId,
} from "@/lib/adminPushSubscriptions";
import { isValidPushClientId } from "@/utils/adminPushClientId";

function authorize(req) {
  const secret = process.env.ADMIN_ORDERS_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };
  const header = req.headers["x-admin-secret"];
  if (!header || header !== secret) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const auth = authorize(req);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return res.status(503).json({ ok: false, error: "admin_not_configured" });
    }
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const pushClientId = String(req.body?.pushClientId || "").trim();
  const endpoint = String(req.body?.endpoint || "").trim();
  if (!endpoint && !isValidPushClientId(pushClientId)) {
    return res.status(400).json({ ok: false, error: "missing_push_identity" });
  }
  if (isValidPushClientId(pushClientId)) {
    await removeAdminPushSubscriptionByPushClientId(pushClientId);
  }
  if (endpoint) {
    await removeAdminPushSubscriptionByEndpoint(endpoint);
  }
  return res.status(200).json({ ok: true });
}
