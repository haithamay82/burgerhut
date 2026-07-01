import { getRatingsSummary } from "@/lib/ratingsStore";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const summary = await getRatingsSummary();
  return res.status(200).json({
    ok: true,
    average: summary.average,
    count: summary.count,
    configured: summary.configured,
  });
}
