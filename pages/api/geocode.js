/**
 * Proxy ל-Nominatim (OSM) כדי לעקוף CORS בדפדפן.
 * GET ?q=כתובת
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const q = req.query.q;
  if (!q || typeof q !== "string" || q.trim().length < 3) {
    return res.status(400).json({ ok: false, error: "bad_query" });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&q=${encodeURIComponent(
      q.trim()
    )}`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "BurgerHutOrdering/1.0",
        "Accept-Language": "he,ar,en",
      },
    });
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: "geocode_upstream" });
    }
    const data = await r.json();
    if (!Array.isArray(data) || !data[0]) {
      return res.status(200).json({ ok: false, error: "not_found" });
    }
    const row = data[0];
    const lat = parseFloat(row.lat);
    const lon = parseFloat(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(200).json({ ok: false, error: "not_found" });
    }
    return res.status(200).json({
      ok: true,
      lat,
      lon,
      displayName: row.display_name || "",
    });
  } catch {
    return res.status(500).json({ ok: false, error: "server" });
  }
}
