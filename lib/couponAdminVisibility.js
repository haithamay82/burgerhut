import { redis, isRedisConfigured } from "@/lib/redis";

const TTL_FALLBACK_SEC = 60 * 60 * 24 * 30;

/**
 * אחרי שליחת ווטסאפ — מסיר סימון שמסתיר קופון מממשק המנהל (אם היה).
 * @param {string} orderRowId
 */
export async function revealCouponForOrderRowAfterWaSent(orderRowId) {
  if (!isRedisConfigured() || !redis) return;
  const id = String(orderRowId || "").trim();
  if (!id) return;
  let codeRaw;
  try {
    codeRaw = await redis.get(`coupon:order:${id}`);
  } catch {
    return;
  }
  const code =
    typeof codeRaw === "string"
      ? codeRaw
      : typeof codeRaw?.code === "string"
        ? codeRaw.code
        : "";
  const upper = String(code || "").trim().toUpperCase();
  if (!upper) return;
  let coupon;
  try {
    coupon = await redis.get(`coupon:${upper}`);
  } catch {
    return;
  }
  if (!coupon || typeof coupon !== "object" || !coupon.couponAdminHidden) return;
  const next = { ...coupon };
  delete next.couponAdminHidden;
  const exp = Number(coupon.expiresAt) || 0;
  const ex =
    Number.isFinite(exp) && exp > Date.now()
      ? Math.ceil((exp - Date.now()) / 1000)
      : TTL_FALLBACK_SEC;
  try {
    await redis.set(`coupon:${upper}`, next, { ex: Math.max(60, ex) });
  } catch {
    /* ignore */
  }
}
