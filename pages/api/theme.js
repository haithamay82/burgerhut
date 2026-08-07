import { getSiteTheme, setSiteTheme } from "@/lib/themeStore";
import { authorizeAdminOnly } from "@/lib/adminAuth";
import { normalizeThemeId } from "@/utils/theme";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const theme = await getSiteTheme();
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    return res.status(200).json({ ok: true, themeId: theme.themeId });
  }

  if (req.method === "PUT") {
    const auth = authorizeAdminOnly(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "admin_not_configured" });
      }
      if (auth.reason === "forbidden") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    let body = {};
    try {
      if (typeof req.body === "string") body = JSON.parse(req.body || "{}");
      else if (req.body && typeof req.body === "object") body = req.body;
    } catch {
      body = {};
    }

    const themeId = normalizeThemeId(body.themeId);
    if (!themeId) {
      return res.status(400).json({ ok: false, error: "invalid_theme" });
    }
    const result = await setSiteTheme(themeId);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }
    return res.status(200).json({
      ok: true,
      themeId: result.themeId,
      updatedAt: result.updatedAt,
    });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
