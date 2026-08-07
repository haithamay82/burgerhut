"use client";

import { useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { submitFoodRating } from "@/utils/ratingClient";

/**
 * @param {{ value: number, max?: number, size?: "sm" | "md", className?: string }} props
 */
export function StarDisplay({ value, max = 5, size = "md", className = "" }) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const sz = size === "sm" ? "text-[11px]" : "text-lg";
  const stars = [];
  for (let i = 1; i <= max; i += 1) {
    const filled = v >= i;
    const half = !filled && v >= i - 0.5;
    stars.push(
      <span
        key={i}
        className={
          filled
            ? "text-amber-400"
            : half
              ? "text-amber-400/70"
              : "text-slate-600"
        }
        aria-hidden
      >
        {filled || half ? "★" : "☆"}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 leading-none ${sz} ${className}`}
      aria-hidden
    >
      {stars}
    </span>
  );
}

/**
 * @param {{
 *   orderNumber: string|number,
 *   source?: string,
 *   onSubmitted?: () => void,
 *   onSkip?: () => void,
 *   compact?: boolean,
 * }} props
 */
export default function FoodRatingCard({
  orderNumber,
  source = "success",
  onSubmitted,
  onSkip,
  compact = false,
}) {
  const { t } = useLocale();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const active = hover || stars;

  const submit = async () => {
    if (busy || done) return;
    if (stars < 1) {
      setErr(t("rating.pickStars"));
      return;
    }
    setBusy(true);
    setErr("");
    const { ok, data } = await submitFoodRating({
      orderNumber,
      stars,
      comment,
      source,
    });
    setBusy(false);
    if (ok || data?.error === "already_rated") {
      setDone(true);
      try {
        window.dispatchEvent(new CustomEvent("bh-rating-updated"));
      } catch {
        /* ignore */
      }
      onSubmitted?.();
      return;
    }
    if (data?.error === "redis_not_configured") {
      setErr(t("rating.unavailable"));
    } else if (data?.error === "order_not_found") {
      setErr(t("rating.orderNotFound"));
    } else {
      setErr(t("rating.submitErr"));
    }
  };

  if (done) {
    return (
      <section
        className={`w-full rounded-2xl border border-emerald-500/35 bg-emerald-950/25 text-center ${
          compact ? "max-w-sm p-4" : "max-w-md p-5"
        }`}
        dir="rtl"
      >
        <p className="text-sm font-semibold text-emerald-200">
          {t("rating.thanks")}
        </p>
      </section>
    );
  }

  return (
    <section
      className={`w-full rounded-2xl border border-[#f5a623]/40 bg-black/60 text-center shadow-lg ${
        compact ? "max-w-sm p-4" : "max-w-md p-5"
      }`}
      dir="rtl"
    >
      <h3
        className={`font-bold text-[#f5a623] ${
          compact ? "mb-1 text-sm" : "mb-2 text-base"
        }`}
      >
        {t("rating.title")}
      </h3>
      <p className={`text-gray-300 ${compact ? "mb-3 text-xs" : "mb-4 text-sm"}`}>
        {t("rating.subtitle")}
      </p>
      <div
        className="mb-3 flex items-center justify-center gap-1"
        role="radiogroup"
        aria-label={t("rating.starsAria")}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={busy}
            className={`rounded p-1 transition-transform hover:scale-110 disabled:opacity-50 ${
              active >= n ? "text-amber-400" : "text-slate-500"
            } ${compact ? "text-2xl" : "text-3xl"}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => setStars(n)}
            aria-label={t("rating.starN").replace("{n}", String(n))}
            aria-checked={stars === n}
            role="radio"
          >
            ★
          </button>
        ))}
      </div>
      {!compact ? (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={busy}
          rows={2}
          maxLength={400}
          placeholder={t("rating.commentPh")}
          className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-right text-sm text-gray-100 placeholder:text-gray-500 focus:border-[#f5a623]/60 focus:outline-none"
        />
      ) : null}
      {err ? (
        <p className="mb-2 text-xs text-amber-200/90">{err}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-[#f5a623] py-2.5 text-sm font-bold text-black disabled:opacity-50"
        >
          {busy ? t("rating.submitting") : t("rating.submitBtn")}
        </button>
        {onSkip ? (
          <button
            type="button"
            disabled={busy}
            onClick={onSkip}
            className="w-full rounded-xl border border-slate-600 py-2.5 text-sm font-semibold text-gray-300"
          >
            {t("rating.skipBtn")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
