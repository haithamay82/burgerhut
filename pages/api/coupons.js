import { redis, isRedisConfigured } from "@/lib/redis";

function authorize(req) {
  const secret = process.env.ADMIN_ORDERS_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };
  const header = req.headers["x-admin-secret"];
  if (!header || header !== secret) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

function couponKeyFromCode(code) {
  return `coupon:${String(code || "").trim().toUpperCase()}`;
}

export default async function handler(req, res) {
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

  if (req.method === "GET") {
    try {
      const keys = await redis.keys("coupon:BH*");
      const couponKeys = Array.isArray(keys) ? keys : [];
      const rowsRaw = await Promise.all(couponKeys.map((k) => redis.get(k)));
      const rows = rowsRaw
        .filter((x) => x && typeof x === "object")
        .map((x) => ({
          code: String(x.code || "").trim().toUpperCase(),
          value: Number(x.value) || 0,
          percentage: Number(x.percentage) || 0,
          orderId: String(x.orderId || ""),
          used: Boolean(x.used),
          createdAt: Number(x.createdAt) || 0,
          expiresAt: Number(x.expiresAt) || 0,
          usedAt: Number(x.usedAt) || 0,
        }))
        .filter((x) => /^BH[A-Z0-9]{6}$/.test(x.code))
        .sort((a, b) => b.createdAt - a.createdAt);
      return res.status(200).json({ ok: true, coupons: rows });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: "coupon_list_failed",
        message: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  if (req.method === "DELETE") {
    const rawCode = req.query.code ?? req.body?.code;
    const code = String(rawCode || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ ok: false, error: "missing_code" });
    try {
      const key = couponKeyFromCode(code);
      const coupon = await redis.get(key);
      await redis.del(key);
      if (coupon?.orderId) {
        const orderKey = `coupon:order:${String(coupon.orderId)}`;
        const mapped = await redis.get(orderKey);
        if (String(mapped || "").trim().toUpperCase() === code) {
          await redis.del(orderKey);
        }
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: "coupon_delete_failed",
        message: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  res.setHeader("Allow", "GET, DELETE");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
