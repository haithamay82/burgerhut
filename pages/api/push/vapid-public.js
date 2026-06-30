/**
 * מפתח VAPID ציבורי לרישום Push לקוחות (PWA).
 */
export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const pub = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  if (!pub) {
    return res.status(200).json({
      ok: false,
      error: "vapid_not_configured",
    });
  }
  return res.status(200).json({ ok: true, publicKey: pub });
}
