import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { useOrderingHours } from "@/contexts/OrderingHoursContext";
import { jerusalemDayKey } from "@/utils/orderingHours";

const ACK_STORAGE_KEY = "bh_preopen_dialog_ack_v1";

function wasAcknowledgedToday() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ACK_STORAGE_KEY) === jerusalemDayKey();
  } catch {
    return false;
  }
}

export default function PreOpeningDialog() {
  const { t } = useLocale();
  const {
    hoursLoaded,
    preOpeningWindow,
    todayOpenTimeDisplay,
  } = useOrderingHours();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hoursLoaded || !preOpeningWindow) {
      setOpen(false);
      return;
    }
    setOpen(!wasAcknowledgedToday());
  }, [hoursLoaded, preOpeningWindow]);

  const dismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(ACK_STORAGE_KEY, jerusalemDayKey());
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  }, []);

  if (!open) return null;

  const openTime = todayOpenTimeDisplay || "16:00";

  return (
    <div
      className="fixed inset-0 z-[520] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-open-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="pre-open-dialog-title"
          className="mb-3 text-base font-bold text-primary"
        >
          {t("home.preOpenDialogTitle")}
        </h3>
        <p className="text-sm leading-relaxed text-gray-100">
          {t("home.preOpenDialogLine1").replace("{openTime}", openTime)}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-300">
          {t("home.preOpenDialogLine2").replace("{openTime}", openTime)}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="btn-primary mt-5 w-full text-sm"
        >
          {t("home.preOpenDialogAck")}
        </button>
      </div>
    </div>
  );
}
