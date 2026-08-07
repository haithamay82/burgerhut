import { kvGetJson, kvSetJson } from "@/lib/kvStore";
import { DEFAULT_THEME_ID, normalizeThemeId } from "@/utils/theme";

const KV_KEY = "burgerhut:theme";

/** @type {{ themeId: string, updatedAt: number } | null} */
let memoryTheme = null;

/**
 * @returns {Promise<{ themeId: import("@/utils/theme").BhThemeId, updatedAt: number }>}
 */
export async function getSiteTheme() {
  const fromKv = await kvGetJson(KV_KEY);
  if (fromKv && typeof fromKv === "object") {
    const themeId = normalizeThemeId(fromKv.themeId) || DEFAULT_THEME_ID;
    return {
      themeId,
      updatedAt: Number(fromKv.updatedAt) || 0,
    };
  }
  if (memoryTheme) {
    return {
      themeId: normalizeThemeId(memoryTheme.themeId) || DEFAULT_THEME_ID,
      updatedAt: Number(memoryTheme.updatedAt) || 0,
    };
  }
  return { themeId: DEFAULT_THEME_ID, updatedAt: 0 };
}

/**
 * @param {import("@/utils/theme").BhThemeId} themeId
 */
export async function setSiteTheme(themeId) {
  const id = normalizeThemeId(themeId);
  if (!id) return { ok: false, error: "invalid_theme" };
  const next = { themeId: id, updatedAt: Date.now() };
  const saved = await kvSetJson(KV_KEY, next);
  memoryTheme = next;
  if (!saved) {
    /* still ok in memory for local/dev without Redis */
  }
  return { ok: true, themeId: id, updatedAt: next.updatedAt };
}
