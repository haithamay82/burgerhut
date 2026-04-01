import formidable from "formidable";
import { promises as fs } from "fs";
import path from "path";
import {
  UPLOAD_DIR,
  extFromMime,
  getPromoPublicState,
  removeAllPromoVideos,
  setPromoMeta,
} from "@/lib/promoStore";

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

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const state = await getPromoPublicState();
      return res.status(200).json({
        ok: true,
        active: Boolean(state.videoUrl),
        videoUrl: state.videoUrl,
        version: state.version,
        enabled: state.enabled,
        hasFile: state.hasFile,
      });
    } catch {
      return res.status(200).json({
        ok: true,
        active: false,
        videoUrl: null,
        version: 0,
        enabled: false,
        hasFile: false,
      });
    }
  }

  if (req.method === "PUT") {
    const auth = authorize(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "admin_not_configured" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "invalid_json" });
    }
    if (typeof body.enabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "invalid_body" });
    }
    await setPromoMeta({ enabled: body.enabled });
    const state = await getPromoPublicState();
    return res.status(200).json({
      ok: true,
      enabled: body.enabled,
      active: Boolean(state.videoUrl),
      videoUrl: state.videoUrl,
      version: state.version,
      hasFile: state.hasFile,
    });
  }

  if (req.method === "POST") {
    const auth = authorize(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "admin_not_configured" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const maxUploadBytes = process.env.VERCEL
      ? 4 * 1024 * 1024
      : 80 * 1024 * 1024;

    const form = formidable({
      maxFileSize: maxUploadBytes,
      uploadDir: UPLOAD_DIR,
      keepExtensions: true,
    });

    let files;
    try {
      [, files] = await form.parse(req);
    } catch (e) {
      const msg = e?.message || "";
      if (
        msg.includes("maxFileSize") ||
        e?.httpCode === 413 ||
        e?.code === 413
      ) {
        return res.status(413).json({
          ok: false,
          error: "file_too_large",
          maxMb: Math.floor(maxUploadBytes / (1024 * 1024)),
        });
      }
      return res.status(400).json({ ok: false, error: "parse_failed" });
    }

    const raw = files.video;
    const file = Array.isArray(raw) ? raw[0] : raw;
    if (!file || !file.filepath) {
      return res.status(400).json({ ok: false, error: "missing_file" });
    }
    if (Number(file.size) > maxUploadBytes) {
      try {
        await fs.unlink(file.filepath);
      } catch {
        /* ignore */
      }
      return res.status(413).json({
        ok: false,
        error: "file_too_large",
        maxMb: Math.floor(maxUploadBytes / (1024 * 1024)),
      });
    }

    const mime = String(file.mimetype || "").toLowerCase();
    if (!mime.startsWith("video/")) {
      try {
        await fs.unlink(file.filepath);
      } catch {
        /* ignore */
      }
      return res.status(400).json({ ok: false, error: "invalid_type" });
    }

    const ext = extFromMime(file.mimetype);
    const filename = `promo${ext}`;
    const dest = path.join(UPLOAD_DIR, filename);

    await removeAllPromoVideos();

    try {
      await fs.rename(file.filepath, dest);
    } catch {
      try {
        await fs.copyFile(file.filepath, dest);
        await fs.unlink(file.filepath);
      } catch {
        return res.status(500).json({ ok: false, error: "save_failed" });
      }
    }

    await setPromoMeta({ enabled: true, filename, externalUrl: null });

    const state = await getPromoPublicState();

    return res.status(200).json({
      ok: true,
      filename,
      videoUrl: state.videoUrl,
      version: state.version,
      active: Boolean(state.videoUrl),
    });
  }

  res.setHeader("Allow", "GET, PUT, POST");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
