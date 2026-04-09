import {
  getHomeSliderMeta,
  setHomeSliderDisplayEnabled,
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

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const auth = authorize(req);
      const meta = await getHomeSliderMeta();
      const displayEnabled = meta.enabled !== false;
      const images = meta.images.map(({ id, url }) => ({ id, url }));
      res.setHeader(
        "Cache-Control",
        "private, no-store, no-cache, must-revalidate, max-age=0"
      );
      res.setHeader("CDN-Cache-Control", "no-store");
      res.setHeader("Vercel-CDN-Cache-Control", "no-store");
      if (auth.ok) {
        return res.status(200).json({
          ok: true,
          images,
          version: meta.updatedAt,
          displayEnabled,
        });
      }
      return res.status(200).json({
        ok: true,
        images: displayEnabled ? images : [],
        version: meta.updatedAt,
      });
    } catch {
      return res.status(200).json({ ok: true, images: [], version: 0 });
    }
  }

  if (req.method === "PATCH") {
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
    if (typeof body?.displayEnabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "missing_displayEnabled" });
    }
    const result = await setHomeSliderDisplayEnabled(body.displayEnabled);
    if (!result.ok) {
      return res.status(503).json({ ok: false, error: result.error });
    }
    const meta = await getHomeSliderMeta();
    return res.status(200).json({
      ok: true,
      images: meta.images.map(({ id, url }) => ({ id, url })),
      version: meta.updatedAt,
      displayEnabled: meta.enabled !== false,
    });
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
