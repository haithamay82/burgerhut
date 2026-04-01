import { useMemo, useRef, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

function formatDate(ts, locale) {
  const d = new Date(Number(ts) || Date.now());
  const intlLocale = locale === "ar" ? "ar-EG" : "he-IL";
  return new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(d);
}

export default function CouponCard({ coupon }) {
  const { t, locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef(null);

  const expiryText = useMemo(
    () => formatDate(coupon?.expiresAt, locale),
    [coupon?.expiresAt, locale]
  );

  if (!coupon) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(coupon.code || ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const onDownload = async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#0b1220",
        scale: 2,
      });
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `coupon-${coupon.code || "BH"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* ignore */
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="mb-4 w-full max-w-sm rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-900/35 via-slate-900 to-cyan-900/35 p-4 shadow-[0_0_25px_-10px_rgba(16,185,129,0.9)]">
      <div
        ref={cardRef}
        className="rounded-xl border border-white/10 bg-slate-950/80 p-4 text-right"
      >
        <p className="mb-2 text-lg font-extrabold text-emerald-300">
          {t("success.couponTitle")}
        </p>
        <p className="text-sm font-bold text-amber-200">
          {t("success.couponValue").replace(
            "{value}",
            String(Number(coupon.value) || 0)
          )}
        </p>
        <p className="mt-1 text-sm font-semibold text-sky-200">
          {t("success.couponCode").replace("{code}", String(coupon.code || ""))}
        </p>
        <p className="mt-1 text-xs text-gray-300">
          {t("success.couponExpiry").replace("{date}", expiryText)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full border border-cyan-400/40 bg-cyan-900/25 px-3 py-1.5 text-xs font-semibold text-cyan-100"
        >
          {copied ? t("success.couponCopied") : t("success.couponCopy")}
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="rounded-full border border-emerald-400/40 bg-emerald-900/25 px-3 py-1.5 text-xs font-semibold text-emerald-100 disabled:opacity-60"
        >
          {downloading ? t("success.couponDownloadBusy") : t("success.couponDownload")}
        </button>
      </div>
    </section>
  );
}
