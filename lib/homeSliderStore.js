import { promises as fs } from "fs";
import path from "path";
import { isKvEnabled, kvDelKey, kvGetJson, kvSetJson } from "@/lib/kvStore";

const DATA_DIR = path.join(process.cwd(), "data");
const SLIDER_FILE = path.join(DATA_DIR, "home-slider.json");
const KV_KEY = "burgerhut:home-slider";
const MAX_IMAGES = 24;

/**
 * @returns {Promise<{ images: { id: string, url: string }[], updatedAt: number }>}
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
  for (let attempt = 0; attempt < 4; attempt++) {
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
    await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
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
  };
}

async function saveHomeSliderMeta(next) {
  if (isKvEnabled()) {
    const wantSig = sliderListSignature(next.images);
    /** רשימה ריקה: מוחקים מפתח — חלק מהלקוחות לא מחזירים אחרי set {} ערך אמין ל־get */
    if (next.images.length === 0) {
      const delOk = await kvDelKey(KV_KEY);
      if (delOk && (await verifySliderKvMatchesSignature(wantSig))) {
        return;
      }
    }
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
  const removed = cur.images.find((x) => x.id === want) || null;
  const next = {
    images: cur.images.filter((x) => x.id !== want),
    updatedAt: Date.now(),
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

/** תגובת GET ציבורית */
export async function getHomeSliderPublic() {
  const meta = await getHomeSliderMeta();
  return {
    ok: true,
    images: meta.images.map(({ id, url }) => ({ id, url })),
    version: meta.updatedAt,
  };
}
