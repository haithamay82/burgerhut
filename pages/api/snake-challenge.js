import {
  getSnakeChallengeWinners,
  incrementSnakeChallengeWinners,
} from "@/lib/snakeChallengeStore";

/**
 * GET  — מספר מי שצלחו את אתגר ה־10
 * POST — דיווח על הצלחה (ניקוד 10) — מגדיל את המונה ב־1
 */
export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0"
  );

  if (req.method === "GET") {
    const winners = await getSnakeChallengeWinners();
    return res.status(200).json({ ok: true, winners });
  }

  if (req.method === "POST") {
    const score = Number(req.body?.score);
    if (!Number.isFinite(score) || score < 10) {
      return res.status(400).json({ ok: false, error: "invalid_score" });
    }
    const winners = await incrementSnakeChallengeWinners();
    return res.status(200).json({ ok: true, winners });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
