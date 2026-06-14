import { sendAdminTestPush } from "@/lib/adminPushNotify";

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

  const result = await sendAdminTestPush();
  if (!result.ok) {
    return res.status(result.error === "no_subscriptions" ? 404 : 503).json({
      ok: false,
      error: result.error,
    });
  }

  return res.status(200).json({
    ok: true,
    sent: result.sent,
    failed: result.failed,
    removed: result.removed,
  });
}
