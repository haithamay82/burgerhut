import { appendSliderUpload, canPersistSliderUploads, getHomeSliderMeta } from "@/lib/homeSliderStore";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

/** ~6MB בינארי אחרי decode — מעט מעל גודל קלט ל־appendSliderUpload */
const MAX_B64_CHARS = 9_000_000;

function authorize(req) {
  const secret = process.env.ADMIN_ORDERS_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };
  const header = req.headers["x-admin-secret"];
  if (!header || header !== secret) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

export default async function handler(req, res) {
  const auth = authorize(req);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return res.status(503).json({ ok: false, error: "admin_not_configured" });
    }
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!canPersistSliderUploads()) {
    return res.status(503).json({
      ok: false,
      error: "slider_upload_requires_kv",
    });
  }

  const raw =
    req.body && typeof req.body === "object"
      ? String(req.body.imageBase64 || "").replace(/\s/g, "")
      : "";
  if (!raw) {
    return res.status(400).json({ ok: false, error: "missing_image" });
  }
  if (raw.length > MAX_B64_CHARS) {
    return res.status(413).json({ ok: false, error: "file_too_large" });
  }

  let buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    return res.status(400).json({ ok: false, error: "invalid_base64" });
  }
  if (!buffer.length) {
    return res.status(400).json({ ok: false, error: "invalid_buffer" });
  }

  const result = await appendSliderUpload(buffer);
  if (!result.ok) {
    const map = {
      invalid_buffer: 400,
      file_too_large: 413,
      invalid_image: 400,
      image_too_large_after_process: 413,
      slider_max_images: 400,
      persist_blob_failed: 503,
      persist_meta_failed: 503,
    };
    const status = map[result.error] || 400;
    return res.status(status).json({ ok: false, error: result.error });
  }

  const meta = await getHomeSliderMeta();
  return res.status(200).json({
    ok: true,
    id: result.id,
    images: meta.images.map(({ id: i, url }) => ({ id: i, url })),
    version: meta.updatedAt,
    displayEnabled: meta.enabled !== false,
  });
}
