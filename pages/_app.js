import { useEffect } from "react";
import "@/styles/globals.css";
import { CartProvider } from "@/hooks/useCart";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { MenuCatalogProvider } from "@/contexts/MenuCatalogContext";
import { InventoryProvider } from "@/contexts/InventoryContext";
import { OrderingHoursProvider } from "@/contexts/OrderingHoursContext";
import { isStandalonePwaDisplay } from "@/utils/pwaDisplay";

const SITE_VISIT_STORAGE_KEY = "bh_site_visit_v1";
const PWA_INSTALL_REPORTED_KEY = "bh_pwa_install_reported_v1";

function jerusalemDayKeyClient() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Jerusalem",
  });
}

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  /** ספירת ביקור יומית אחת למכשיר (אתר או אפליקציה מותקנת) — לדשבורד מנהל */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const today = jerusalemDayKeyClient();
      if (window.localStorage.getItem(SITE_VISIT_STORAGE_KEY) === today) return;
      const channel = isStandalonePwaDisplay() ? "pwa" : "web";
      fetch("/api/site-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      })
        .then((r) => r.json().catch(() => ({})))
        .then((d) => {
          if (
            d?.ok &&
            (d.recorded === true ||
              d?.error === "redis_not_configured")
          ) {
            window.localStorage.setItem(SITE_VISIT_STORAGE_KEY, today);
          }
        })
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }, []);

  /** ספירת התקנות PWA מצטברת — פעם אחת למכשיר (אירוע appinstalled או פתיחה ראשונה במצב standalone, ל‑iOS) */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reportOnce = () => {
      try {
        if (window.localStorage.getItem(PWA_INSTALL_REPORTED_KEY)) return;
        fetch("/api/pwa-installs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
          .then((r) => r.json().catch(() => ({})))
          .then((d) => {
            if (d?.ok && d?.recorded === true) {
              window.localStorage.setItem(PWA_INSTALL_REPORTED_KEY, "1");
            }
          })
          .catch(() => {});
      } catch {
        /* ignore */
      }
    };
    const onInstalled = () => reportOnce();
    window.addEventListener("appinstalled", onInstalled);
    if (isStandalonePwaDisplay()) {
      reportOnce();
    }
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  /** PWA מהמסך הבית: רענון כשחוזרים לחזית כדי לטעון גרסה/נתונים עדכניים */
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isStandalonePwaDisplay()) return;

    let sawHidden = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        sawHidden = true;
        return;
      }
      if (document.visibilityState === "visible" && sawHidden) {
        window.location.reload();
      }
    };

    const onPageShow = (e) => {
      if (e.persisted) window.location.reload();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return (
    <LocaleProvider>
      <OrderingHoursProvider>
        <CartProvider>
          <MenuCatalogProvider>
            <InventoryProvider>
              <Component {...pageProps} />
            </InventoryProvider>
          </MenuCatalogProvider>
        </CartProvider>
      </OrderingHoursProvider>
    </LocaleProvider>
  );
}

