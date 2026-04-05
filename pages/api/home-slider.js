import { del as deleteBlob } from "@vercel/blob";
import {
  clearHomeSliderImages,
  getHomeSliderPublic,
  removeHomeSliderImage,
} from "@/lib/homeSliderStore";

function authorize(req) {
  const secret = process.env.ADMIN_ORDERS_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };
  const header = req.headers["x-admin-secret"];
  if (!header || header !== secret) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const s = Buffer.concat(chunks).toString("utf8");
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Next.js מפרסר מראש JSON ל-req.body; קריאה חוזרת מהזרם מחזירה {} או נתקעת —
 * ואז «נקה הכל» נכשל והלקוח נשאר ב-sliderBusy=true.
 */
function bodyFromNextParser(req) {
  const b = req.body;
  if (b === undefined || b === null) return null;
  if (Buffer.isBuffer(b)) {
    try {
      const s = b.toString("utf8");
      return s ? JSON.parse(s) : {};
    } catch {
      return null;
    }
  }
  if (typeof b === "string") {
    try {
      return b.trim() ? JSON.parse(b) : {};
    } catch {
      return null;
    }
  }
  if (typeof b === "object") return b;
  return null;
}

async function getJsonBody(req) {
  const parsed = bodyFromNextParser(req);
  if (parsed !== null) return parsed;
  return readJsonBody(req);
}

function isVercelBlobUrl(u) {
  return typeof u === "string" && u.includes(".public.blob.vercel-storage.com");
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const data = await getHomeSliderPublic();
      res.setHeader(
        "Cache-Control",
        "private, no-store, no-cache, must-revalidate, max-age=0"
      );
      res.setHeader("CDN-Cache-Control", "no-store");
      res.setHeader("Vercel-CDN-Cache-Control", "no-store");
      return res.status(200).json(data);
    } catch {
      return res.status(200).json({ ok: true, images: [], version: 0 });
    }
  }

  if (req.method === "DELETE") {
    const auth = authorize(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "admin_not_configured" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    let body;
    try {
      body = await getJsonBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "invalid_json" });
    }
    const id = String(body?.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "missing_id" });
    }
    const result = await removeHomeSliderImage(id);
    if (!result.ok) {
      const status =
        result.error === "persist_failed" ||
        result.error === "persist_verify_failed"
          ? 503
          : result.error === "not_found"
            ? 404
            : 400;
      return res.status(status).json({ ok: false, error: result.error });
    }
    const data = await getHomeSliderPublic();
    if (result.removed?.url && isVercelBlobUrl(result.removed.url)) {
      void deleteBlob(result.removed.url).catch(() => {
        /* ignore blob delete failure */
      });
    }
    return res.status(200).json({ ok: true, ...data });
  }

  if (req.method === "POST") {
    const auth = authorize(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "admin_not_configured" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    let body;
    try {
      body = await getJsonBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "invalid_json" });
    }
    if (body?.clear !== true) {
      return res.status(400).json({ ok: false, error: "invalid_body" });
    }
    const cleared = await clearHomeSliderImages();
    if (!cleared.ok) {
      const status =
        cleared.error === "persist_failed" ||
        cleared.error === "persist_verify_failed"
          ? 503
          : 400;
      return res.status(status).json({ ok: false, error: cleared.error });
    }
    const data = await getHomeSliderPublic();
    for (const url of cleared.removedUrls) {
      if (typeof url === "string" && isVercelBlobUrl(url)) {
        void deleteBlob(url).catch(() => {
          /* ignore blob delete failure */
        });
      }
    }
    return res.status(200).json({ ok: true, ...data });
  }

  res.setHeader("Allow", "GET, DELETE, POST");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
