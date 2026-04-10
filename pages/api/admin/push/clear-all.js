import { clearAllAdminPushSubscriptions } from "@/lib/adminPushSubscriptions";

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
  res.setHeader(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0"
  );
  const out = await clearAllAdminPushSubscriptions();
  if (!out.ok) {
    if (out.error === "redis_not_configured") {
      return res.status(503).json({ ok: false, error: "redis_not_configured" });
    }
    if (out.error === "clear_verify_failed") {
      return res.status(500).json({ ok: false, error: "clear_verify_failed" });
    }
    return res.status(500).json({ ok: false, error: out.error || "clear_failed" });
  }
  return res.status(200).json({
    ok: true,
    subscriptionCount: Number(out.subscriptionCount) || 0,
  });
}
