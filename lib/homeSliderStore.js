import { promises as fs } from "fs";
import path from "path";
import { isKvEnabled, kvGetJson, kvSetJson } from "@/lib/kvStore";

const DATA_DIR = path.join(process.cwd(), "data");
const SLIDER_FILE = path.join(DATA_DIR, "home-slider.json");
const KV_KEY = "burgerhut:home-slider";
const MAX_IMAGES = 24;

/**
 * @returns {Promise<{ images: { id: string, url: string }[], updatedAt: number, enabled: boolean }>}
 */
export async function getHomeSliderMeta() {
  const fromKv = await kvGetJson(KV_KEY);
  if (isKvEnabled()) {
    /**
     * בפרודקשן עם KV — רק KV הוא מקור האמת.
     * קובץ data/home-slider.json בדיפלוי (מקומי שחובר ל-git או מבילד ישן) עם updatedAt גבוה
     * דרס בעבר את הרשימה מה-KV ואז מחיקות «לא נשמרו» מהצד של הלקוח.
     */
    if (fromKv && typeof fromKv === "object") {
      return normalizeSliderShape({
        ...fromKv,
        images: Array.isArray(fromKv.images) ? fromKv.images : [],
      });
    }
    return { images: [], updatedAt: 0 };
  }
  if (fromKv && typeof fromKv === "object") {
    return normalizeSliderShape({
      ...fromKv,
      images: Array.isArray(fromKv.images) ? fromKv.images : [],
    });
  }
  try {
    const raw = await fs.readFile(SLIDER_FILE, "utf8");
    return normalizeSliderShape(JSON.parse(raw));
  } catch {
    return { images: [], updatedAt: 0 };
  }
}

function sliderListSignature(images) {
  return JSON.stringify(
    [...images]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((x) => [x.id, x.url])
  );
}

async function verifySliderKvMatchesSignature(wantSig) {
  /** מחיקות מהירות ברצף — קריאה אחרי כתיבה עלולה להשהות; מרחיבים ניסיונות */
  for (let attempt = 0; attempt < 10; attempt++) {
    const raw = await kvGetJson(KV_KEY);
    const readBack = normalizeSliderShape(
      raw && typeof raw === "object"
        ? {
            ...raw,
            images: Array.isArray(raw.images) ? raw.images : [],
          }
        : { images: [], updatedAt: 0 }
    );
    if (sliderListSignature(readBack.images) === wantSig) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
  }
  return false;
}

function normalizeSliderShape(raw) {
  const images = [];
  for (const row of raw.images || []) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id || "").trim();
    const url = String(row.url || "").trim();
    if (!id || !url || !/^https?:\/\//i.test(url)) continue;
    images.push({ id, url });
  }
  return {
    images: images.slice(0, MAX_IMAGES),
    updatedAt: Number(raw.updatedAt) || 0,
    enabled: raw?.enabled !== false,
  };
}

async function saveHomeSliderMeta(input) {
  const next = normalizeSliderShape(input);
  if (isKvEnabled()) {
    const wantSig = sliderListSignature(next.images);
    const ok = await kvSetJson(KV_KEY, next);
    if (!ok) {
      throw new Error("slider_persist_kv_failed");
    }
    if (!(await verifySliderKvMatchesSignature(wantSig))) {
      throw new Error("slider_persist_verify_failed");
    }
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SLIDER_FILE, JSON.stringify(next, null, 2), "utf8");
}

/**
 * @param {string} url
 * @param {string} id
 */
export async function appendHomeSliderImage(url, id) {
  const cur = await getHomeSliderMeta();
  if (cur.images.length >= MAX_IMAGES) {
    return { ok: false, error: "slider_max_images" };
  }
  const u = String(url || "").trim();
  const i = String(id || "").trim();
  if (!u || !/^https?:\/\//i.test(u) || !i) {
    return { ok: false, error: "invalid" };
  }
  if (cur.images.some((x) => x.id === i || x.url === u)) {
    return { ok: false, error: "duplicate" };
  }
  const next = {
    images: [...cur.images, { id: i, url: u }],
    updatedAt: Date.now(),
    enabled: cur.enabled !== false,
  };
  try {
    await saveHomeSliderMeta(next);
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || "").includes("verify")
        ? "persist_verify_failed"
        : "persist_failed",
    };
  }
  return { ok: true, meta: next };
}

/**
 * @param {string} id
 * @returns {Promise<{ ok: true, removed: { id: string, url: string } | null } | { ok: false, error: string }>}
 */
export async function removeHomeSliderImage(id) {
  const want = String(id || "").trim();
  if (!want) return { ok: false, error: "missing_id" };
  const cur = await getHomeSliderMeta();
  if (cur.images.length === 0) {
    return { ok: true, removed: null };
  }
  const removed = cur.images.find((x) => x.id === want) || null;
  if (!removed) {
    return { ok: false, error: "not_found" };
  }
  const next = {
    images: cur.images.filter((x) => x.id !== want),
    updatedAt: Date.now(),
    enabled: cur.enabled !== false,
  };
  try {
    await saveHomeSliderMeta(next);
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || "").includes("verify")
        ? "persist_verify_failed"
        : "persist_failed",
    };
  }
  return { ok: true, removed };
}

/**
 * איפוס אטומי של כל תמונות הסליידר (מומלץ במקום מחיקות מהירות ברצף — נמנע lost-update).
 * @returns {Promise<{ ok: true, removedUrls: string[] } | { ok: false, error: string, removedUrls: [] }>}
 */
export async function clearHomeSliderImages() {
  const cur = await getHomeSliderMeta();
  const removedUrls = cur.images.map((x) => x.url);
  if (cur.images.length === 0) {
    return { ok: true, removedUrls: [] };
  }
  const next = {
    images: [],
    updatedAt: Date.now(),
    enabled: cur.enabled !== false,
  };
  try {
    await saveHomeSliderMeta(next);
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || "").includes("verify")
        ? "persist_verify_failed"
        : "persist_failed",
      removedUrls: [],
    };
  }
  return { ok: true, removedUrls };
}

/**
 * הצגת סליידר בדף הבית (לקוחות). כבוי = אין תמונות ב-API ציבורי — חוסך Blob transfer.
 */
export async function setHomeSliderDisplayEnabled(displayEnabled) {
  const cur = await getHomeSliderMeta();
  const next = {
    images: cur.images,
    updatedAt: Date.now(),
    enabled: Boolean(displayEnabled),
  };
  try {
    await saveHomeSliderMeta(next);
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || "").includes("verify")
        ? "persist_verify_failed"
        : "persist_failed",
    };
  }
  return { ok: true };
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
