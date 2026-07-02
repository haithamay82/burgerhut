import { saveFoodRating, saveVisitorRating } from "@/lib/ratingsStore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  let body = {};
  try {
    if (typeof req.body === "string") body = JSON.parse(req.body || "{}");
    else if (req.body && typeof req.body === "object") body = req.body;
  } catch {
    body = {};
  }

  const hasOrder =
    body.orderNumber !== undefined &&
    body.orderNumber !== null &&
    String(body.orderNumber).trim() !== "";

  const result = hasOrder
    ? await saveFoodRating({
        orderNumber: body.orderNumber,
        stars: body.stars,
        comment: body.comment,
        source: body.source,
      })
    : await saveVisitorRating({
        name: body.name,
        stars: body.stars,
        comment: body.comment,
        source: body.source,
      });

  if (result.error === "redis_not_configured") {
    return res.status(503).json({ ok: false, error: "redis_not_configured" });
  }
  if (result.error === "order_not_found") {
    return res.status(404).json({ ok: false, error: "order_not_found" });
  }
  if (result.error === "already_rated") {
    return res.status(409).json({
      ok: false,
      error: "already_rated",
      rated: true,
      rating: result.rating,
    });
  }
  if (
    result.error === "invalid_stars" ||
    result.error === "invalid_order_number" ||
    result.error === "invalid_name"
  ) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  if (!result.ok) {
    return res.status(500).json({ ok: false, error: result.error || "save_failed" });
  }

  return res.status(200).json({
    ok: true,
    rating: result.rating,
    summary: result.summary,
  });
}
