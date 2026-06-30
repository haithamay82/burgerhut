import { broadcastCustomerPromoPush } from "@/lib/customerPushNotify";
import { authorizeAdminOnly } from "@/lib/adminAuth";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const auth = authorizeAdminOnly(req);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return res.status(503).json({ ok: false, error: "admin_not_configured" });
    }
    if (auth.reason === "forbidden") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const { title, body, url } = req.body || {};
  const result = await broadcastCustomerPromoPush({ title, body, url });
  if (!result.ok) {
    const status =
      result.error === "no_subscriptions"
        ? 404
        : result.error === "invalid_content" || result.error === "invalid_url"
          ? 400
          : 503;
    return res.status(status).json({ ok: false, error: result.error });
  }

  return res.status(200).json({
    ok: true,
    sent: result.sent,
    failed: result.failed,
    removed: result.removed,
  });
}
