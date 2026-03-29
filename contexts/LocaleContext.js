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
  const [locale, setLocaleState] = useState("ar");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "he" || saved === "ar") setLocaleState(saved);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale === "he" ? "he" : "ar";
    document.documentElement.dir = "rtl";
  }, [locale, ready]);

  const setLocale = useCallback((next) => {
    if (next !== "he" && next !== "ar") return;
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
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
