import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { t as translate } from "@/utils/i18n";

const LocaleContext = createContext(null);

const STORAGE_KEY = "burgerhut-locale";

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState("he");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = String(raw || "").trim();
      if (saved === "he" || saved === "ar") setLocaleState(saved);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      const v = String(e.newValue).trim();
      if (v === "he" || v === "ar") setLocaleState(v);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale === "he" ? "he" : "ar";
    document.documentElement.dir = "rtl";
  }, [locale, ready]);

  const setLocale = useCallback((next) => {
    const v = String(next || "").trim();
    if (v !== "he" && v !== "ar") return;
    setLocaleState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((key) => translate(locale, key), [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}
