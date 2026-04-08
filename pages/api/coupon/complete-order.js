import { findOrderByOrderNumber } from "@/lib/ordersStore";
import { redis, isRedisConfigured } from "@/lib/redis";

const TTL_SECONDS = 60 * 60 * 24 * 30;

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
  const orderNumber = body.orderNumber;
  if (!code) {
    return res.status(400).json({ ok: false, error: "missing_code" });
  }
  if (
    orderNumber === undefined ||
    orderNumber === null ||
    String(orderNumber).trim() === ""
  ) {
    return res.status(400).json({ ok: false, error: "missing_order_number" });
  }

  try {
    const order = await findOrderByOrderNumber(orderNumber);
    if (!order) {
      return res.status(404).json({ ok: false, error: "order_not_found" });
    }

    const orderCode = String(order.customer?.couponCode || "").trim().toUpperCase();
    if (!orderCode || orderCode !== code) {
      return res.status(400).json({ ok: false, error: "coupon_order_mismatch" });
    }

    const channel = String(order.channel || "");
    if (channel !== "checkout_bit" && channel !== "checkout_card") {
      return res.status(400).json({ ok: false, error: "order_channel_not_deferred" });
    }

    const coupon = await redis.get(`coupon:${code}`);
    if (!coupon) {
      return res.status(404).json({ ok: false, error: "coupon_invalid" });
    }

    const ordN = Number(order.orderNumber);

    if (coupon.used) {
      const by = coupon.usedByOrderNumber;
      if (by !== undefined && by !== null && Number(by) === ordN) {
        return res.status(200).json({ ok: true, already: true });
      }
      return res.status(400).json({ ok: false, error: "coupon_used" });
    }

    if (Date.now() > Number(coupon.expiresAt || 0)) {
      return res.status(400).json({ ok: false, error: "coupon_expired" });
    }

    const nextCoupon = {
      ...coupon,
      used: true,
      usedAt: Date.now(),
      usedByOrderNumber: String(order.orderNumber ?? "").trim(),
    };
    await redis.set(`coupon:${code}`, nextCoupon, { ex: TTL_SECONDS });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "coupon_complete_failed",
      message: e instanceof Error ? e.message : "unknown",
    });
  }
}
