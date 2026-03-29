import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const PROMO_FILE = path.join(DATA_DIR, "promo.json");
export const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const ALLOWED_EXT = new Set([".mp4", ".webm", ".mov"]);

/**
 * @returns {Promise<{ enabled: boolean, filename: string | null, updatedAt: number }>}
 */
export async function getPromoMeta() {
  try {
    const raw = await fs.readFile(PROMO_FILE, "utf8");
    const j = JSON.parse(raw);
    const fn =
      typeof j.filename === "string" && j.filename.startsWith("promo.")
        ? j.filename
        : null;
    return {
      enabled: Boolean(j.enabled),
      filename: fn,
      updatedAt: Number(j.updatedAt) || 0,
    };
  } catch {
    return { enabled: false, filename: null, updatedAt: 0 };
  }
}

/**
 * @param {Partial<{ enabled: boolean, filename: string | null, updatedAt: number }>} patch
 */
export async function setPromoMeta(patch) {
  const cur = await getPromoMeta();
  const next = {
    ...cur,
    ...patch,
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PROMO_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function extFromMime(mimetype) {
  if (!mimetype || typeof mimetype !== "string") return ".mp4";
  const m = mimetype.toLowerCase();
  if (m.includes("webm")) return ".webm";
  if (m.includes("quicktime")) return ".mov";
  return ".mp4";
}

export async function fileExistsInUploads(filename) {
  if (!filename || typeof filename !== "string") return false;
  const safe = path.basename(filename);
  if (!safe.startsWith("promo.")) return false;
  try {
    await fs.access(path.join(UPLOAD_DIR, safe));
    return true;
  } catch {
    return false;
  }
}

/** Remove promo.mp4 / promo.webm / promo.mov */
export async function removeAllPromoVideos() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  let entries = [];
  try {
    entries = await fs.readdir(UPLOAD_DIR);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith("promo.") && ALLOWED_EXT.has(path.extname(name).toLowerCase())) {
      try {
        await fs.unlink(path.join(UPLOAD_DIR, name));
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Public URL for active promo video, or null.
 * @returns {Promise<{ videoUrl: string | null, version: number, enabled: boolean, hasFile: boolean }>}
 */
export async function getPromoPublicState() {
  const meta = await getPromoMeta();
  const hasFile =
    meta.filename && (await fileExistsInUploads(meta.filename));
  const active = Boolean(meta.enabled && hasFile && meta.filename);
  const videoUrl = active ? `/uploads/${meta.filename}` : null;
  return {
    videoUrl,
    version: meta.updatedAt,
    enabled: meta.enabled,
    hasFile: Boolean(hasFile),
  };
}
