import {
  generateCoupon,
  MIN_COUPON_DISPLAY_VALUE_NIS,
} from "@/lib/coupon";
import { redis, isRedisConfigured } from "@/lib/redis";
import { getDiscountConfig } from "@/lib/discountStore";

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  if (!isRedisConfigured() || !redis) {
    return res.status(503).json({ ok: false, error: "redis_not_configured" });
  }

  const body = req.body || {};
  const orderId = String(body.orderId || "").trim();
  const orderNumberBody = body.orderNumber;
  const sourceOrderNumber =
    orderNumberBody !== undefined &&
    orderNumberBody !== null &&
    String(orderNumberBody).trim() !== ""
      ? String(orderNumberBody).trim()
      : /^\d+$/.test(orderId)
        ? orderId
        : "";
  /** לרוב: מזון נטו אחרי מבצע/קופון (בלי דמי משלוח) — ראו couponRewardBaseNis בצ'קאאוט */
  const amount = Number(body.amount);
  if (!orderId) return res.status(400).json({ ok: false, error: "missing_order_id" });
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: "invalid_amount" });
  }

  const discountCfg = await getDiscountConfig();
  const couponEnabled = Boolean(discountCfg?.couponEnabled);
  const couponPct = Number(discountCfg?.couponPercent) || 0;
  if (!couponEnabled || couponPct <= 0) {
    return res.status(200).json({
      ok: true,
      coupon: null,
      enabled: false,
    });
  }

  try {
    const existing = await redis.get(`coupon:order:${orderId}`);
    const existingCode =
      typeof existing === "string"
        ? existing
        : typeof existing?.code === "string"
          ? existing.code
          : "";
    if (existingCode) {
      const existingCoupon = await redis.get(`coupon:${existingCode}`);
      if (existingCoupon) {
        const existingAmount = Number(existingCoupon.baseAmount);
        const existingPct = Number(existingCoupon.percentage);
        const isSameCalcBase =
          Number.isFinite(existingAmount) &&
          Math.abs(existingAmount - amount) < 0.01 &&
          Number.isFinite(existingPct) &&
          Math.abs(existingPct - couponPct) < 0.001;
        if (isSameCalcBase) {
          const existingVal = Number(existingCoupon.value);
          if (
            Number.isFinite(existingVal) &&
            existingVal >= MIN_COUPON_DISPLAY_VALUE_NIS
          ) {
            return res.status(200).json({ ok: true, coupon: existingCoupon });
          }
          return res.status(200).json({
            ok: true,
            coupon: null,
            enabled: true,
          });
        }
      }
    }

    const coupon = generateCoupon({
      orderId,
      sourceOrderNumber,
      amount,
      percentage: couponPct,
    });

    if (!coupon) {
      return res.status(200).json({
        ok: true,
        coupon: null,
        enabled: true,
      });
    }

    await redis.set(`coupon:${coupon.code}`, coupon, { ex: TTL_SECONDS });
    await redis.set(`coupon:order:${orderId}`, coupon.code, { ex: TTL_SECONDS });

    return res.status(200).json({ ok: true, coupon });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "coupon_create_failed",
      message: e instanceof Error ? e.message : "unknown",
    });
  }
}
