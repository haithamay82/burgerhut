import { isRedisConfigured } from "@/lib/redis";
import { countAdminPushSubscriptions } from "@/lib/adminPushSubscriptions";

function authorize(req) {
  const secret = process.env.ADMIN_ORDERS_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };
  const header = req.headers["x-admin-secret"];
  if (!header || header !== secret) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const auth = authorize(req);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return res.status(503).json({ ok: false, error: "admin_not_configured" });
    }
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const pub = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const priv = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const vapidConfigured = Boolean(pub && priv);
  const redisConfigured = isRedisConfigured();
  const subscriptionCount = await countAdminPushSubscriptions();
  return res.status(200).json({
    ok: true,
    vapidConfigured,
    redisConfigured,
    subscriptionCount,
  });
}
