import {
  removeAdminPushSubscriptionByEndpoint,
  removeAdminPushSubscriptionByPushClientId,
} from "@/lib/adminPushSubscriptions";
import { isValidPushClientId } from "@/utils/adminPushClientId";
import { authorizeAdminOrEmployee } from "@/lib/adminAuth";

function authorize(req) {
  return authorizeAdminOrEmployee(req);
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
