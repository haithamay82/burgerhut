/** @typedef {"dark" | "concrete"} BhThemeId */

export const THEME_IDS = /** @type {const} */ (["dark", "concrete"]);

export const DEFAULT_THEME_ID = /** @type {BhThemeId} */ ("dark");

export const CUSTOMER_THEME_STORAGE_KEY = "bh_theme_customer_v1";

/**
 * @param {unknown} raw
 * @returns {BhThemeId | null}
 */
export function normalizeThemeId(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "dark" || v === "concrete") return v;
  return null;
}

/**
 * @param {BhThemeId} themeId
 */
export function applyThemeToDocument(themeId) {
  if (typeof document === "undefined") return;
  const id = normalizeThemeId(themeId) || DEFAULT_THEME_ID;
  document.documentElement.setAttribute("data-theme", id);
  document.documentElement.style.colorScheme = id === "concrete" ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", id === "concrete" ? "#9e9a93" : "#0a0a0a");
  }
}

/**
 * @returns {BhThemeId | null}
 */
export function readCustomerThemePreference() {
  if (typeof window === "undefined") return null;
  try {
    return normalizeThemeId(window.localStorage.getItem(CUSTOMER_THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * @param {BhThemeId | null} themeId
 */
export function writeCustomerThemePreference(themeId) {
  if (typeof window === "undefined") return;
  try {
    if (!themeId) {
      window.localStorage.removeItem(CUSTOMER_THEME_STORAGE_KEY);
      return;
    }
    const id = normalizeThemeId(themeId);
    if (!id) return;
    window.localStorage.setItem(CUSTOMER_THEME_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
