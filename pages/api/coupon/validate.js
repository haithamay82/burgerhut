import { redis, isRedisConfigured } from "@/lib/redis";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!isRedisConfigured() || !redis) {
    return res.status(503).json({ ok: false, error: "redis_not_configured" });
  }

  const body = req.body || {};
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "missing_code" });

  try {
    const coupon = await redis.get(`coupon:${code}`);
    if (!coupon) return res.status(404).json({ ok: false, error: "invalid" });
    if (coupon.used) return res.status(400).json({ ok: false, error: "already_used" });
    if (Date.now() > Number(coupon.expiresAt || 0)) {
      return res.status(400).json({ ok: false, error: "expired" });
    }
    return res.status(200).json({
      ok: true,
      coupon: {
        code: coupon.code,
        value: coupon.value,
        percentage: coupon.percentage,
        expiresAt: coupon.expiresAt,
        orderId: coupon.orderId,
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "coupon_validate_failed",
      message: e instanceof Error ? e.message : "unknown",
    });
  }
}
