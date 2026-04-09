import formidable from "formidable";
import { promises as fs } from "fs";
import {
  appendSliderUpload,
  canPersistSliderUploads,
  getHomeSliderMeta,
  removeSliderUpload,
} from "@/lib/homeSliderStore";

export const config = {
  api: {
    bodyParser: false,
  },
};

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

  if (req.method === "DELETE") {
    const id = String(req.query?.id || "").trim().toLowerCase();
    if (!id) {
      return res.status(400).json({ ok: false, error: "missing_id" });
    }
    const result = await removeSliderUpload(id);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return res.status(status).json({ ok: false, error: result.error });
    }
    const meta = await getHomeSliderMeta();
    return res.status(200).json({
      ok: true,
      images: meta.images.map(({ id: i, url }) => ({ id: i, url })),
      version: meta.updatedAt,
      displayEnabled: meta.enabled !== false,
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!canPersistSliderUploads()) {
    return res.status(503).json({
      ok: false,
      error: "slider_upload_requires_kv",
    });
  }

  const form = formidable({
    maxFiles: 1,
    maxFileSize: 6 * 1024 * 1024,
    allowEmptyFiles: false,
  });

  let buffer;
  try {
    const [, files] = await form.parse(req);
    const file =
      files?.file?.[0] ||
      files?.image?.[0] ||
      files?.photo?.[0] ||
      Object.values(files || {})
        .flat()
        .find((f) => f && f.filepath);
    if (!file?.filepath) {
      return res.status(400).json({ ok: false, error: "missing_file" });
    }
    try {
      buffer = await fs.readFile(file.filepath);
    } finally {
      try {
        await fs.unlink(file.filepath);
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("maxFileSize") || msg.includes("limit")) {
      return res.status(413).json({ ok: false, error: "file_too_large" });
    }
    return res.status(400).json({ ok: false, error: "upload_parse_failed" });
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
