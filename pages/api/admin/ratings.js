import { authorizeAdminOnly } from "@/lib/adminAuth";
import {
  deleteAllRatings,
  deleteRatingById,
  listAdminRatings,
} from "@/lib/ratingsStore";

function unauthorizedResponse(auth, res) {
  if (auth.reason === "not_configured") {
    return res.status(503).json({ ok: false, error: "admin_not_configured" });
  }
  if (auth.reason === "forbidden") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  return res.status(401).json({ ok: false, error: "unauthorized" });
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const auth = authorizeAdminOnly(req);
  if (!auth.ok) return unauthorizedResponse(auth, res);

  res.setHeader(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0"
  );

  if (req.method === "GET") {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 200;
    const result = await listAdminRatings({ limit });
    if (!result.configured) {
      return res.status(503).json({ ok: false, error: "redis_not_configured" });
    }
    return res.status(200).json({
      ok: true,
      ratings: result.ratings,
      summary: result.summary,
    });
  }

  const body =
    typeof req.body === "object" && req.body !== null ? req.body : {};
  const all = Boolean(body.all);
  const id = String(body.id || "").trim();
  const result = all ? await deleteAllRatings() : await deleteRatingById(id);

  if (result.error === "redis_not_configured") {
    return res.status(503).json({ ok: false, error: "redis_not_configured" });
  }
  if (result.error === "invalid_id") {
    return res.status(400).json({ ok: false, error: "invalid_id" });
  }
  if (result.error === "not_found") {
    return res.status(404).json({ ok: false, error: "not_found" });
  }
  if (!result.ok) {
    return res.status(500).json({ ok: false, error: "delete_failed" });
  }

  return res.status(200).json({
    ok: true,
    summary: result.summary,
  });
}
