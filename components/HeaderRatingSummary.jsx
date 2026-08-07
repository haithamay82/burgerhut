"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { StarDisplay } from "@/components/FoodRatingCard";
import HeaderRatingsDialog from "@/components/HeaderRatingsDialog";

export default function HeaderRatingSummary() {
  const { t } = useLocale();
  const [summary, setSummary] = useState(
    /** @type {{ average: number, count: number } | null} */ (null)
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/ratings/summary")
        .then((r) => r.json().catch(() => ({})))
        .then((d) => {
          if (cancelled) return;
          const count = Number(d?.count) || 0;
          if (!d?.ok || count <= 0) {
            setSummary(null);
            return;
          }
          setSummary({
            average: Number(d.average) || 0,
            count,
          });
        })
        .catch(() => {
          if (!cancelled) setSummary(null);
        });
    };
    load();
    const onUpdated = () => load();
    window.addEventListener("bh-rating-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("bh-rating-updated", onUpdated);
    };
  }, []);

  if (!summary?.count) return null;

  const avgText = summary.average.toFixed(1);

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-0 whitespace-nowrap rounded-md px-1 py-0.5 text-[9px] leading-none text-amber-200/90 underline decoration-amber-400/30 underline-offset-2 transition-colors hover:text-amber-100 hover:decoration-amber-400/60 sm:text-[10px]"
        dir="rtl"
        aria-label={t("rating.headerOpenList")}
      >
        <StarDisplay value={summary.average} size="sm" />
        <span className="font-semibold tabular-nums">{avgText}</span>
        <span className="text-gray-400">·</span>
        <span>{t("rating.headerCount").replace("{n}", String(summary.count))}</span>
      </button>
      <HeaderRatingsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        average={summary.average}
        count={summary.count}
      />
    </>
  );
}
