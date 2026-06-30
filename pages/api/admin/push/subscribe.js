import { saveAdminPushSubscription } from "@/lib/adminPushSubscriptions";
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
  const sub = req.body?.subscription;
  if (!sub || typeof sub !== "object" || !String(sub.endpoint || "").trim()) {
    return res.status(400).json({ ok: false, error: "invalid_subscription" });
  }
  const pushClientId = String(req.body?.pushClientId || "").trim();
  if (!isValidPushClientId(pushClientId)) {
    return res.status(400).json({ ok: false, error: "invalid_push_client_id" });
  }
  const out = await saveAdminPushSubscription(sub, pushClientId);
  if (!out.ok) {
    if (out.error === "redis_not_configured") {
      return res.status(503).json({ ok: false, error: "redis_not_configured" });
    }
    return res.status(400).json({ ok: false, error: out.error || "save_failed" });
  }
  return res.status(200).json({ ok: true });
}
