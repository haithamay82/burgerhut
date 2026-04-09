import { promises as fs } from "fs";
import path from "path";
import { isKvEnabled, kvGetJson, kvSetJson } from "@/lib/kvStore";

const DATA_DIR = path.join(process.cwd(), "data");
const SLIDER_FILE = path.join(DATA_DIR, "home-slider.json");
const KV_KEY = "burgerhut:home-slider";
const SLIDER_PUBLIC_DIR = path.join(process.cwd(), "public", "home-slider");
const MAX_IMAGES = 24;
const IMG_EXT = /\.(jpe?g|png|gif|webp|avif)$/i;

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

/** תמונות מתיקיית public/home-slider/ בלבד — אותו דומיין, בלי Blob */
export async function listImagesFromPublicSliderDir() {
  let names;
  try {
    names = await fs.readdir(SLIDER_PUBLIC_DIR);
  } catch {
    return [];
  }
  const filtered = names.filter(safeSliderFilename);
  filtered.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return filtered.slice(0, MAX_IMAGES).map((filename) => ({
    id: `fs-${filename.replace(/[^a-zA-Z0-9.-]+/g, "_")}`,
    url: `/home-slider/${encodeURIComponent(filename)}`,
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

async function loadRawSliderDoc() {
  const fromKv = await kvGetJson(KV_KEY);
  if (isKvEnabled()) {
    if (fromKv && typeof fromKv === "object") {
      return {
        enabled: fromKv.enabled,
        updatedAt: fromKv.updatedAt,
      };
    }
    return { enabled: true, updatedAt: 0 };
  }
  if (fromKv && typeof fromKv === "object") {
    return {
      enabled: fromKv.enabled,
      updatedAt: fromKv.updatedAt,
    };
  }
  try {
    const raw = JSON.parse(await fs.readFile(SLIDER_FILE, "utf8"));
    return {
      enabled: raw?.enabled,
      updatedAt: raw?.updatedAt,
    };
  } catch {
    return { enabled: true, updatedAt: 0 };
  }
}

/**
 * @returns {Promise<{ images: { id: string, url: string }[], updatedAt: number, enabled: boolean }>}
 */
export async function getHomeSliderMeta() {
  const raw = await loadRawSliderDoc();
  const images = await listImagesFromPublicSliderDir();
  const dirVer = await sliderDirectoryVersionMs();
  const version = Math.max(Number(raw.updatedAt) || 0, dirVer);
  return {
    images,
    updatedAt: version,
    enabled: raw.enabled !== false,
  };
}

async function persistSliderSettings(enabled) {
  const payload = {
    enabled: Boolean(enabled),
    updatedAt: Date.now(),
  };
  if (isKvEnabled()) {
    const ok = await kvSetJson(KV_KEY, payload);
    if (!ok) throw new Error("slider_persist_kv_failed");
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SLIDER_FILE, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * הצגת סליידר בדף הבית (לקוחות). כבוי = לא מחזירים תמונות ב-API ציבורי.
 */
export async function setHomeSliderDisplayEnabled(displayEnabled) {
  try {
    await persistSliderSettings(displayEnabled);
  } catch {
    return { ok: false, error: "persist_failed" };
  }
  return { ok: true };
}

/** תגובת GET ציבורית */
export async function getHomeSliderPublic() {
  const meta = await getHomeSliderMeta();
  const enabled = meta.enabled !== false;
  return {
    ok: true,
    images: enabled ? meta.images.map(({ id, url }) => ({ id, url })) : [],
    version: meta.updatedAt,
  };
}
