import { listPublicRatings, getRatingsSummary } from "@/lib/ratingsStore";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
  const { ratings, configured } = await listPublicRatings({ limit });
  const summary = await getRatingsSummary();

  return res.status(200).json({
    ok: true,
    ratings,
    average: summary.average,
    count: summary.count,
    configured,
  });
}
