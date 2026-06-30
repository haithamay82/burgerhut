import {
  countAdminPushSubscriptions,
  isAdminPushStorageConfigured,
} from "@/lib/adminPushSubscriptions";
import { authorizeAdminOrEmployee } from "@/lib/adminAuth";

function authorize(req) {
  return authorizeAdminOrEmployee(req);
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
  res.setHeader(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0"
  );
  const pub = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const priv = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const vapidConfigured = Boolean(pub && priv);
  const redisConfigured = isAdminPushStorageConfigured();
  const subscriptionCount = await countAdminPushSubscriptions();
  return res.status(200).json({
    ok: true,
    vapidConfigured,
    redisConfigured,
    subscriptionCount,
  });
}
