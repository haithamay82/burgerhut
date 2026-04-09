import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { isKvEnabled, kvDelKey, kvGetJson, kvSetJson } from "@/lib/kvStore";

const DATA_DIR = path.join(process.cwd(), "data");
const SLIDER_FILE = path.join(DATA_DIR, "home-slider.json");
const SLIDER_UPLOADS_DIR = path.join(DATA_DIR, "home-slider-uploads");
const KV_KEY = "burgerhut:home-slider";
const SLIDER_PUBLIC_DIR = path.join(process.cwd(), "public", "home-slider");
const MAX_IMAGES = 24;
const IMG_EXT = /\.(jpe?g|png|gif|webp|avif)$/i;
const UPLOAD_ID_RE = /^[a-f0-9]{32}$/;

function blobKvKey(id) {
  return `burgerhut:hs:u:${id}`;
}

function safeSliderFilename(name) {
  if (!name || typeof name !== "string") return false;
  if (
    name.startsWith(".") ||
    name.includes("..") ||
    name.includes("/") ||
    name.includes("\\")
  ) {
    return false;
  }
  return IMG_EXT.test(name);
}

export async function listImagesFromPublicSliderDir() {
  let names;
  try {
    names = await fs.readdir(SLIDER_PUBLIC_DIR);
  } catch {
    return [];
  }
  const filtered = names.filter(safeSliderFilename);
  filtered.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return filtered.map((filename) => ({
    id: `fs-${filename.replace(/[^a-zA-Z0-9.-]+/g, "_")}`,
    url: `/home-slider/${encodeURIComponent(filename)}`,
    source: "fs",
  }));
}

async function sliderDirectoryVersionMs() {
  try {
    const names = await fs.readdir(SLIDER_PUBLIC_DIR);
    let maxM = 0;
    for (const n of names) {
      if (!safeSliderFilename(n)) continue;
      try {
        const st = await fs.stat(path.join(SLIDER_PUBLIC_DIR, n));
        if (st.mtimeMs > maxM) maxM = st.mtimeMs;
      } catch {
        /* skip */
      }
    }
    return Math.floor(maxM);
  } catch {
    return 0;
  }
}

function normalizeUploads(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id || "").trim().toLowerCase();
    if (!UPLOAD_ID_RE.test(id)) continue;
    out.push({
      id,
      createdAt: Number(row.createdAt) || 0,
    });
  }
  return out;
}

async function loadFullSliderDoc() {
  const fromKv = await kvGetJson(KV_KEY);
  if (isKvEnabled()) {
    if (fromKv && typeof fromKv === "object") {
      return {
        enabled: fromKv.enabled,
        updatedAt: Number(fromKv.updatedAt) || 0,
        uploads: normalizeUploads(fromKv.uploads),
      };
    }
    return { enabled: true, updatedAt: 0, uploads: [] };
  }
  if (fromKv && typeof fromKv === "object") {
    return {
      enabled: fromKv.enabled,
      updatedAt: Number(fromKv.updatedAt) || 0,
      uploads: normalizeUploads(fromKv.uploads),
    };
  }
  try {
    const raw = JSON.parse(await fs.readFile(SLIDER_FILE, "utf8"));
    return {
      enabled: raw?.enabled,
      updatedAt: Number(raw?.updatedAt) || 0,
      uploads: normalizeUploads(raw?.uploads),
    };
  } catch {
    return { enabled: true, updatedAt: 0, uploads: [] };
  }
}

async function saveFullSliderDoc(doc) {
  const payload = {
    enabled: doc.enabled !== false,
    updatedAt: Number(doc.updatedAt) || Date.now(),
    uploads: normalizeUploads(doc.uploads),
  };
  if (isKvEnabled()) {
    const ok = await kvSetJson(KV_KEY, payload);
    if (!ok) throw new Error("slider_persist_kv_failed");
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SLIDER_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function buildUploadImageEntries(uploads) {
  return uploads.map((u) => ({
    id: `kv-${u.id}`,
    url: `/api/home-slider/image?id=${encodeURIComponent(u.id)}`,
    source: "kv",
  }));
}

function computeVersion(doc, dirVer) {
  let v = Math.max(Number(doc.updatedAt) || 0, dirVer);
  for (const u of doc.uploads || []) {
    if (Number(u.createdAt) > v) v = Number(u.createdAt);
  }
  return v;
}

/**
 * @returns {Promise<{ images: { id: string, url: string, source?: string }[], updatedAt: number, enabled: boolean }>}
 */
export async function getHomeSliderMeta() {
  const doc = await loadFullSliderDoc();
  const uploadImages = buildUploadImageEntries(doc.uploads);
  const roomFs = Math.max(0, MAX_IMAGES - uploadImages.length);
  const fsImages = (await listImagesFromPublicSliderDir()).slice(0, roomFs);
  const merged = [...fsImages, ...uploadImages];
  const dirVer = await sliderDirectoryVersionMs();
  return {
    images: merged,
    updatedAt: computeVersion(doc, dirVer),
    enabled: doc.enabled !== false,
  };
}

export async function setHomeSliderDisplayEnabled(displayEnabled) {
  try {
    const cur = await loadFullSliderDoc();
    await saveFullSliderDoc({
      ...cur,
      enabled: Boolean(displayEnabled),
      updatedAt: Date.now(),
    });
  } catch {
    return { ok: false, error: "persist_failed" };
  }
  return { ok: true };
}

/**
 * בפרודקשן ב-Vercel חייב KV/Redis לשמירת תמונות (הדיסק read-only).
 * מקומית: ניתן לשמור תחת data/home-slider-uploads/.
 */
export function canPersistSliderUploads() {
  if (isKvEnabled()) return true;
  if (process.env.VERCEL === "1") return false;
  return true;
}

async function readUploadPayload(id) {
  if (!UPLOAD_ID_RE.test(id)) return null;
  const key = blobKvKey(id);
  if (isKvEnabled()) {
    const row = await kvGetJson(key);
    if (!row || typeof row !== "object") return null;
    const d = String(row.d || row.data || "").trim();
    const m = String(row.m || row.mime || "image/jpeg").trim();
    if (!d) return null;
    try {
      return { buffer: Buffer.from(d, "base64"), mime: m || "image/jpeg" };
    } catch {
      return null;
    }
  }
  try {
    const fp = path.join(SLIDER_UPLOADS_DIR, `${id}.jpg`);
    const buffer = await fs.readFile(fp);
    return { buffer, mime: "image/jpeg" };
  } catch {
    return null;
  }
}

export async function getSliderUploadIfListed(id) {
  const clean = String(id || "").trim().toLowerCase();
  if (!UPLOAD_ID_RE.test(clean)) return null;
  const doc = await loadFullSliderDoc();
  if (!doc.uploads.some((u) => u.id === clean)) return null;
  return readUploadPayload(clean);
}

const MAX_INPUT_BYTES = 6 * 1024 * 1024;
const MAX_STORED_BASE64 = 2_200_000;

/**
 * @param {Buffer} input
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function appendSliderUpload(input) {
  if (!Buffer.isBuffer(input) || input.length === 0) {
    return { ok: false, error: "invalid_buffer" };
  }
  if (input.length > MAX_INPUT_BYTES) {
    return { ok: false, error: "file_too_large" };
  }
  let jpegBuf;
  try {
    jpegBuf = await sharp(input)
      .rotate()
      .resize(1400, 1400, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    return { ok: false, error: "invalid_image" };
  }
  const b64 = jpegBuf.toString("base64");
  if (b64.length > MAX_STORED_BASE64) {
    return { ok: false, error: "image_too_large_after_process" };
  }
  const metaBefore = await getHomeSliderMeta();
  if (metaBefore.images.length >= MAX_IMAGES) {
    return { ok: false, error: "slider_max_images" };
  }
  const doc = await loadFullSliderDoc();
  const id = randomBytes(16).toString("hex");
  const payload = { m: "image/jpeg", d: b64 };
  if (isKvEnabled()) {
    const okBlob = await kvSetJson(blobKvKey(id), payload);
    if (!okBlob) return { ok: false, error: "persist_blob_failed" };
  } else {
    try {
      await fs.mkdir(SLIDER_UPLOADS_DIR, { recursive: true });
      await fs.writeFile(path.join(SLIDER_UPLOADS_DIR, `${id}.jpg`), jpegBuf);
    } catch {
      return { ok: false, error: "persist_file_failed" };
    }
  }
  const nextUploads = [
    ...doc.uploads,
    { id, createdAt: Date.now() },
  ];
  try {
    await saveFullSliderDoc({
      ...doc,
      uploads: nextUploads,
      updatedAt: Date.now(),
    });
  } catch {
    if (isKvEnabled()) {
      await kvDelKey(blobKvKey(id));
    } else {
      try {
        await fs.unlink(path.join(SLIDER_UPLOADS_DIR, `${id}.jpg`));
      } catch {
        /* ignore */
      }
    }
    return { ok: false, error: "persist_meta_failed" };
  }
  return { ok: true, id };
}

export async function removeSliderUpload(id) {
  const clean = String(id || "").trim().toLowerCase();
  if (!UPLOAD_ID_RE.test(clean)) return { ok: false, error: "invalid_id" };
  const doc = await loadFullSliderDoc();
  if (!doc.uploads.some((u) => u.id === clean)) {
    return { ok: false, error: "not_found" };
  }
  const nextUploads = doc.uploads.filter((u) => u.id !== clean);
  try {
    await saveFullSliderDoc({
      ...doc,
      uploads: nextUploads,
      updatedAt: Date.now(),
    });
  } catch {
    return { ok: false, error: "persist_failed" };
  }
  if (isKvEnabled()) {
    await kvDelKey(blobKvKey(clean));
  } else {
    try {
      await fs.unlink(path.join(SLIDER_UPLOADS_DIR, `${clean}.jpg`));
    } catch {
      /* ignore */
    }
  }
  return { ok: true };
}

export function isKvUploadId(id) {
  return UPLOAD_ID_RE.test(String(id || "").trim().toLowerCase());
}

/** תגובת GET ציבורית */
export async function getHomeSliderPublic() {
  const meta = await getHomeSliderMeta();
  const enabled = meta.enabled !== false;
  return {
    ok: true,
    images: enabled
      ? meta.images.map(({ id, url }) => ({ id, url }))
      : [],
    version: meta.updatedAt,
  };
}
