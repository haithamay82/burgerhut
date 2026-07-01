import { getRatingByOrderNumber } from "@/lib/ratingsStore";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const raw =
    (Array.isArray(req.query.on) ? req.query.on[0] : req.query.on) ||
    (Array.isArray(req.query.orderNumber)
      ? req.query.orderNumber[0]
      : req.query.orderNumber);
  const orderNumber = Number(raw);
  if (!Number.isFinite(orderNumber) || orderNumber <= 0) {
    return res.status(400).json({ ok: false, error: "invalid_order_number" });
  }

  const rating = await getRatingByOrderNumber(orderNumber);
  return res.status(200).json({
    ok: true,
    rated: Boolean(rating),
    rating: rating || null,
  });
}
