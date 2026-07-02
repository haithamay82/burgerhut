"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/router";
import { useLocale } from "@/contexts/LocaleContext";
import {
  dismissSiteRatingForSession,
  permanentlyDismissSiteRating,
  shouldShowSiteRatingDialog,
  submitVisitorRating,
} from "@/utils/siteRatingPrompt";
import { shouldShowRatingReminder } from "@/utils/ratingClient";

export default function SiteRatingDialog() {
  const { t } = useLocale();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const path = router?.pathname || "";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!shouldShowSiteRatingDialog(path)) {
      setOpen(false);
      return;
    }
    if (shouldShowRatingReminder(path)) {
      setOpen(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setOpen(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [mounted, path]);

  if (!mounted || !open || typeof document === "undefined") {
    return null;
  }

  const active = hover || stars;

  const closeAfterTaste = () => {
    dismissSiteRatingForSession();
    setOpen(false);
  };

  const closeNever = () => {
    permanentlyDismissSiteRating();
    setOpen(false);
  };

  const submit = async () => {
    if (busy) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErr(t("rating.siteNameRequired"));
      return;
    }
    if (stars < 1) {
      setErr(t("rating.pickStars"));
      return;
    }
    setBusy(true);
    setErr("");
    const { ok, data } = await submitVisitorRating({
      name: trimmedName,
      stars,
      source: "site",
    });
    setBusy(false);
    if (ok) {
      setOpen(false);
      return;
    }
    if (data?.error === "redis_not_configured") {
      setErr(t("rating.unavailable"));
    } else {
      setErr(t("rating.submitErr"));
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[222] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 border-[#f5a623] bg-black p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-rating-title"
        dir="rtl"
      >
        <h2
          id="site-rating-title"
          className="mb-1 text-center text-base font-bold text-[#f5a623]"
        >
          {t("rating.siteTitle")}
        </h2>
        <p className="mb-4 text-center text-sm text-gray-300">
          {t("rating.siteSubtitle")}
        </p>

        <label className="mb-1 block text-right text-xs font-medium text-gray-300">
          {t("rating.siteNameLabel")}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          maxLength={80}
          placeholder={t("rating.siteNamePh")}
          className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-right text-sm text-gray-100 placeholder:text-gray-500 focus:border-[#f5a623]/60 focus:outline-none"
        />

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
              className={`rounded p-1 text-3xl transition-transform hover:scale-110 disabled:opacity-50 ${
                active >= n ? "text-amber-400" : "text-slate-500"
              }`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setStars(n)}
              aria-label={t("rating.starN").replace("{n}", String(n))}
              aria-checked={stars === n}
              role="radio"
            >
              ★
            </button>
          ))}
        </div>

        {err ? (
          <p className="mb-3 text-center text-xs text-amber-200/90">{err}</p>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="w-full rounded-xl bg-[#f5a623] py-3 text-sm font-bold text-black disabled:opacity-50"
          >
            {busy ? t("rating.submitting") : t("rating.siteSendBtn")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={closeAfterTaste}
            className="w-full rounded-xl border border-slate-600 py-2.5 text-sm font-semibold text-gray-200"
          >
            {t("rating.siteAfterTasteBtn")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={closeNever}
            className="w-full rounded-xl py-2 text-xs font-medium text-gray-500 underline decoration-gray-600 underline-offset-2 hover:text-gray-400"
          >
            {t("rating.siteNeverBtn")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
