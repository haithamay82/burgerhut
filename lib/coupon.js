export function generateCoupon({ orderId, amount, percentage }) {
  const safeAmount = Number(amount) || 0;
  const safePct = Number(percentage) || 0;
  const value = Math.round((safeAmount * safePct) / 100);
  const code =
    "BH-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = Date.now();

  return {
    code,
    value,
    percentage: safePct,
    orderId: String(orderId || ""),
    baseAmount: safeAmount,
    used: false,
    createdAt: now,
    expiresAt: now + 1000 * 60 * 60 * 24 * 30, // 30 days
  };
}
