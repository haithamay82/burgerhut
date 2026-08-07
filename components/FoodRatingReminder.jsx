"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/router";
import { useLocale } from "@/contexts/LocaleContext";
import FoodRatingCard from "@/components/FoodRatingCard";
import {
  dismissRatingReminderForNow,
  getPendingRating,
  isRatingDoneLocal,
  markRatingDoneLocal,
  shouldShowRatingReminder,
} from "@/utils/ratingClient";

export default function FoodRatingReminder() {
  const { t } = useLocale();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");

  const path = router?.pathname || "";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!shouldShowRatingReminder(path)) {
      setOpen(false);
      return;
    }
    const pending = getPendingRating();
    if (!pending?.orderNumber) {
      setOpen(false);
      return;
    }
    if (isRatingDoneLocal(pending.orderNumber)) {
      setOpen(false);
      return;
    }

    let cancelled = false;
    fetch(`/api/ratings/status?on=${encodeURIComponent(pending.orderNumber)}`)
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (cancelled) return;
        if (d?.rated) {
          markRatingDoneLocal(pending.orderNumber);
          setOpen(false);
          return;
        }
        setOrderNumber(pending.orderNumber);
        setOpen(true);
      })
      .catch(() => {
        if (!cancelled) setOpen(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mounted, path]);

  if (!mounted || !open || !orderNumber || typeof document === "undefined") {
    return null;
  }

  const later = () => {
    dismissRatingReminderForNow();
    setOpen(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[224] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <FoodRatingCard
          orderNumber={orderNumber}
          source="reminder"
          compact
          onSubmitted={() => setOpen(false)}
          onSkip={later}
        />
        <p className="mt-2 text-center text-[10px] text-gray-500">
          {t("rating.reminderHint").replace("{order}", orderNumber)}
        </p>
      </div>
    </div>,
    document.body
  );
}
