import { redis, isRedisConfigured } from "@/lib/redis";

/** מונה מצטבר של דיווחי «התקנת PWA» (מכשיר אחד = ספירה אחת בצד לקוח) */
const KEY_TOTAL = "bh:pwa_install_total";

function authorize(req) {
  const secret = process.env.ADMIN_ORDERS_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };
  const header = req.headers["x-admin-secret"];
  if (!header || header !== secret) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    if (!isRedisConfigured() || !redis) {
      return res.status(200).json({
        ok: true,
        recorded: false,
        error: "redis_not_configured",
      });
    }
    try {
      const total = await redis.incr(KEY_TOTAL);
      return res.status(200).json({ ok: true, recorded: true, total });
    } catch {
      return res.status(500).json({ ok: false, error: "incr_failed" });
    }
  }

  if (req.method === "GET") {
    const auth = authorize(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "admin_not_configured" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (!isRedisConfigured() || !redis) {
      return res.status(503).json({ ok: false, error: "redis_not_configured" });
    }
    try {
      const raw = await redis.get(KEY_TOTAL);
      const total = Number(raw) || 0;
      return res.status(200).json({ ok: true, total });
    } catch {
      return res.status(500).json({ ok: false, error: "read_failed" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
