import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_THEME_ID,
  applyThemeToDocument,
  normalizeThemeId,
  readCustomerThemePreference,
  writeCustomerThemePreference,
} from "@/utils/theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [siteThemeId, setSiteThemeId] = useState(DEFAULT_THEME_ID);
  const [customerThemeId, setCustomerThemeId] = useState(
    /** @type {import("@/utils/theme").BhThemeId | null} */ (null)
  );
  const [ready, setReady] = useState(false);

  const themeId = customerThemeId || siteThemeId || DEFAULT_THEME_ID;

  useEffect(() => {
    const saved = readCustomerThemePreference();
    if (saved) setCustomerThemeId(saved);
    let cancelled = false;
    fetch("/api/theme")
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (cancelled) return;
        const id = normalizeThemeId(d?.themeId);
        if (id) {
          setSiteThemeId(id);
          try {
            document.cookie = `bh_theme_site_v1=${encodeURIComponent(
              id
            )}; path=/; max-age=31536000; SameSite=Lax`;
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyThemeToDocument(themeId);
  }, [themeId]);

  const setTheme = useCallback((next) => {
    const id = normalizeThemeId(next);
    if (!id) return;
    setCustomerThemeId(id);
    writeCustomerThemePreference(id);
    applyThemeToDocument(id);
  }, []);

  const clearCustomerOverride = useCallback(() => {
    setCustomerThemeId(null);
    writeCustomerThemePreference(null);
  }, []);

  const setSiteTheme = useCallback(async (next, adminSecret) => {
    const id = normalizeThemeId(next);
    if (!id) return { ok: false, error: "invalid_theme" };
    const s = String(adminSecret || "").trim();
    if (!s) return { ok: false, error: "unauthorized" };
    try {
      const r = await fetch("/api/theme", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": s,
        },
        body: JSON.stringify({ themeId: id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        return { ok: false, error: d.error || "save_failed" };
      }
      setSiteThemeId(id);
      try {
        document.cookie = `bh_theme_site_v1=${encodeURIComponent(
          id
        )}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        /* ignore */
      }
      return { ok: true, themeId: id };
    } catch {
      return { ok: false, error: "save_failed" };
    }
  }, []);

  const value = useMemo(
    () => ({
      themeId,
      siteThemeId,
      customerThemeId,
      hasCustomerOverride: Boolean(customerThemeId),
      ready,
      setTheme,
      clearCustomerOverride,
      setSiteTheme,
    }),
    [
      themeId,
      siteThemeId,
      customerThemeId,
      ready,
      setTheme,
      clearCustomerOverride,
      setSiteTheme,
    ]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
