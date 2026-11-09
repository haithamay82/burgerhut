import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/contexts/LocaleContext";
import {
  buildActiveOrderSuccessHref,
  clearActiveOrderResume,
  isOpenFulfillmentStatus,
  readActiveOrderResume,
} from "@/utils/activeOrderResume";
import {
  fulfillmentStatusLabelKey,
  fulfillmentStatusToneClass,
} from "@/utils/orderFulfillment";

/** באנר לא-כופה בדף הבית כשיש הזמנה פתוחה */
export default function ActiveOrderHomeBanner() {
  const { t } = useLocale();
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const stored = readActiveOrderResume();
      if (!stored?.orderNumber) {
        if (!cancelled) setActive(null);
        return;
      }
      try {
        const r = await fetch(
          `/api/orders/status?on=${encodeURIComponent(stored.orderNumber)}&_=${Date.now()}`,
          { cache: "no-store" }
        );
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || d.error === "not_found") {
          clearActiveOrderResume();
          setActive(null);
          return;
        }
        const st = String(d?.fulfillment?.status || "");
        if (!isOpenFulfillmentStatus(st)) {
          clearActiveOrderResume();
          setActive(null);
          return;
        }
        setActive(stored);
        setStatus(st);
      } catch {
        if (!cancelled) setActive(null);
      }
    };
    void run();
    const id = window.setInterval(() => void run(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!active?.orderNumber) return null;

  return (
    <section
      className="mb-4 rounded-2xl border border-primary/40 bg-slate-900/80 p-3 text-center shadow-[0_0_24px_-10px_rgba(250,204,21,0.3)]"
      aria-label={t("success.resumeBannerTitle")}
    >
      <p className="text-sm font-bold text-primary">
        {t("success.resumeBannerTitle")}
      </p>
      <p className="mt-1 text-xs text-gray-400">
        {t("success.resumeBannerHint").replace("{order}", `#${active.orderNumber}`)}
      </p>
      {status ? (
        <div
          className={`mt-2 inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-bold ${fulfillmentStatusToneClass(
            status
          )}`}
        >
          {t(fulfillmentStatusLabelKey(status))}
        </div>
      ) : null}
      <div className="mt-3">
        <Link
          href={buildActiveOrderSuccessHref(active)}
          className="inline-flex rounded-full border border-primary/50 bg-primary/15 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/25"
        >
          {t("success.resumeBannerOpen")}
        </Link>
      </div>
    </section>
  );
}
