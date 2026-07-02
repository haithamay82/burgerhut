"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/contexts/LocaleContext";
import { StarDisplay } from "@/components/FoodRatingCard";

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   average: number,
 *   count: number,
 * }} props
 */
export default function HeaderRatingsDialog({ open, onClose, average, count }) {
  const { t, locale } = useLocale();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState(
    /** @type {Array<{ name: string, stars: number, comment: string, createdAt: string }>} */ (
      []
    )
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/ratings/list")
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (cancelled) return;
        setItems(Array.isArray(d?.ratings) ? d.ratings : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const intlLocale = locale === "ar" ? "ar-IL" : "he-IL";
  const avgText = average.toFixed(1);

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(intlLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(d);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[223] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(85vh,28rem)] w-full max-w-md flex-col rounded-2xl border-2 border-[#f5a623] bg-black shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ratings-dialog-title"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-white/10 px-4 py-3 text-center">
          <h2
            id="ratings-dialog-title"
            className="text-base font-bold text-[#f5a623]"
          >
            {t("rating.listTitle")}
          </h2>
          <p className="mt-1 inline-flex flex-wrap items-center justify-center gap-x-1 text-xs text-amber-200/90">
            <StarDisplay value={average} size="sm" />
            <span className="font-semibold tabular-nums">{avgText}</span>
            <span className="text-gray-400">·</span>
            <span>{t("rating.headerCount").replace("{n}", String(count))}</span>
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="py-6 text-center text-sm text-gray-400">
              {t("rating.listLoading")}
            </p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              {t("rating.listEmpty")}
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item, idx) => {
                const displayName =
                  item.name?.trim() || t("rating.anonymousCustomer");
                const key = `${displayName}-${item.createdAt}-${idx}`;
                return (
                  <li
                    key={key}
                    className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-right"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">
                        {displayName}
                      </span>
                      {item.createdAt ? (
                        <span className="text-[10px] tabular-nums text-gray-500">
                          {formatDate(item.createdAt)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mb-1 flex items-center gap-1.5">
                      <StarDisplay value={item.stars} size="sm" />
                      <span className="text-[11px] font-medium text-amber-200/90">
                        {t("rating.starsOfFive").replace(
                          "{n}",
                          String(item.stars)
                        )}
                      </span>
                    </div>
                    {item.comment ? (
                      <p className="text-xs leading-relaxed text-gray-300">
                        «{item.comment}»
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border-2 border-[#f5a623] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/5"
          >
            {t("rating.listClose")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
