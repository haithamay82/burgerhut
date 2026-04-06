/**
 * זיהוי User-Agent של שירותי unfurl (ווטסאפ, פייסבוק, iMessage וכו').
 * משמש ב-middleware כדי לא להפנות www→apex לפני שמגיע HTML עם תגיות OG.
 */
export function isLinkPreviewCrawler(userAgent) {
  if (!userAgent || typeof userAgent !== "string") return false;
  const ua = userAgent.toLowerCase();
  const needles = [
    "whatsapp",
    "facebookexternalhit",
    "facebot",
    "instagram",
    "linkedinbot",
    "twitterbot",
    "slackbot",
    "discordbot",
    "telegrambot",
    "pinterest",
    "applebot",
    "bingpreview",
    "google-inspectiontool",
    "bytespider",
    "amazonbot",
  ];
  return needles.some((n) => ua.includes(n));
}
