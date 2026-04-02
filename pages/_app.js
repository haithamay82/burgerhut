import { useEffect } from "react";
import "@/styles/globals.css";
import { CartProvider } from "@/hooks/useCart";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { InventoryProvider } from "@/contexts/InventoryContext";
import { OrderingHoursProvider } from "@/contexts/OrderingHoursContext";

function isInstalledPwaDisplay() {
  if (typeof window === "undefined") return false;
  const mq = (mode) =>
    window.matchMedia?.(`(display-mode: ${mode})`)?.matches ?? false;
  return (
    mq("standalone") ||
    mq("fullscreen") ||
    mq("minimal-ui") ||
    window.navigator.standalone === true
  );
}

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  /** PWA מהמסך הבית: רענון כשחוזרים לחזית כדי לטעון גרסה/נתונים עדכניים */
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isInstalledPwaDisplay()) return;

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
          <InventoryProvider>
            <Component {...pageProps} />
          </InventoryProvider>
        </CartProvider>
      </OrderingHoursProvider>
    </LocaleProvider>
  );
}

