import {
  countCustomerPushSubscriptions,
  isCustomerPushStorageConfigured,
} from "@/lib/customerPushSubscriptions";
import { authorizeAdminOnly } from "@/lib/adminAuth";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
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
  res.setHeader(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0"
  );
  const pub = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const priv = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const vapidConfigured = Boolean(pub && priv);
  const redisConfigured = isCustomerPushStorageConfigured();
  const subscriptionCount = await countCustomerPushSubscriptions();
  return res.status(200).json({
    ok: true,
    vapidConfigured,
    redisConfigured,
    subscriptionCount,
  });
}
