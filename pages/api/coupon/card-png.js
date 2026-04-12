import sharp from "sharp";
import { redis, isRedisConfigured } from "@/lib/redis";
import { MIN_COUPON_DISPLAY_VALUE_NIS } from "@/lib/coupon";

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  if (!isRedisConfigured() || !redis) {
    return res.status(503).end();
  }

  const raw = req.query.code;
  const code = String(Array.isArray(raw) ? raw[0] : raw || "")
    .trim()
    .toUpperCase();
  if (!code || !/^BH[A-Z0-9]{4,}$/i.test(code)) {
    return res.status(400).end();
  }

  try {
    const coupon = await redis.get(`coupon:${code}`);
    if (!coupon) return res.status(404).end();
    if (coupon.used) return res.status(404).end();
    if (Date.now() > Number(coupon.expiresAt || 0)) return res.status(404).end();
    const value = Number(coupon.value);
    if (!Number.isFinite(value) || value < MIN_COUPON_DISPLAY_VALUE_NIS) {
      return res.status(404).end();
    }

    const exp = new Date(Number(coupon.expiresAt || 0));
    const expStr = Number.isFinite(exp.getTime())
      ? exp.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        })
      : "";

    const codeE = escapeXml(code);
    const valE = escapeXml(String(Math.round(value)));
    const expE = escapeXml(expStr);

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="420" height="600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#065f46"/>
      <stop offset="55%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#164e63"/>
    </linearGradient>
  </defs>
  <rect width="420" height="600" rx="28" fill="url(#bg)"/>
  <rect x="24" y="24" width="372" height="552" rx="16" fill="rgba(15,23,42,0.65)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="210" y="88" text-anchor="middle" fill="#6ee7b7" font-size="26" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-weight="bold">Burger Hut</text>
  <text x="210" y="150" text-anchor="middle" fill="#fcd34d" font-size="34" font-weight="bold" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif">₪${valE} OFF</text>
  <text x="210" y="220" text-anchor="middle" fill="#e2e8f0" font-size="16" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif">Next order coupon</text>
  <text x="210" y="280" text-anchor="middle" fill="#ffffff" font-size="22" font-weight="bold" font-family="monospace">${codeE}</text>
  <text x="210" y="340" text-anchor="middle" fill="#94a3b8" font-size="15" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif">Valid until ${expE}</text>
  <text x="210" y="500" text-anchor="middle" fill="#22d3ee" font-size="13" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif">burgerhut.co.il</text>
</svg>`;

    const png = await sharp(Buffer.from(svg))
      .png({ compressionLevel: 9 })
      .toBuffer();

    const safeFile = code.replace(/[^A-Z0-9]/gi, "") || "coupon";
    res.setHeader("Content-Type", "image/png");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="coupon-${safeFile}.png"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(png);
  } catch (e) {
    console.warn("[coupon/card-png]", e?.message || e);
    return res.status(500).end();
  }
}
