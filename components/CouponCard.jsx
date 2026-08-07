import { useMemo, useState } from "react";
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

  return (
    <section className="mb-4 w-full max-w-sm rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-900/35 via-slate-900 to-cyan-900/35 p-4 shadow-[0_0_25px_-10px_rgba(16,185,129,0.9)]">
      <div className="rounded-xl border border-white/10 bg-bh-input p-4 text-right">
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
        <p className="mt-1 text-xs text-bh-muted">
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
      </div>
    </section>
  );
}
