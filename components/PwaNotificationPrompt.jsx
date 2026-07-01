"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/router";
import { useLocale } from "@/contexts/LocaleContext";
import { registerPwaCustomerPushOnUserAction } from "@/utils/customerPushClient";
import {
  dismissPwaNotificationPromptForNow,
  shouldShowPwaNotificationPrompt,
} from "@/utils/pwaNotificationPrompt";

export default function PwaNotificationPrompt() {
  const { t } = useLocale();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const path = router?.pathname || "";

  const refreshOpen = () => {
    setOpen(shouldShowPwaNotificationPrompt(path));
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    refreshOpen();
    const onInstalled = () => refreshOpen();
    window.addEventListener("bh-pwa-installed", onInstalled);
    return () => window.removeEventListener("bh-pwa-installed", onInstalled);
  }, [mounted, path]);

  useEffect(() => {
    if (!mounted || typeof Notification === "undefined") return;
    if (Notification.permission !== "default") {
      setOpen(false);
    }
  }, [mounted, busy]);

  if (!mounted || !open || typeof document === "undefined") {
    return null;
  }

  const enable = async () => {
    setBusy(true);
    setMsg("");
    const r = await registerPwaCustomerPushOnUserAction();
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      return;
    }
    if (r.error === "permission_denied") {
      setMsg(t("pwaNotify.permissionDenied"));
      setOpen(false);
    } else if (r.error === "no_vapid" || r.error === "redis_not_configured") {
      setMsg(t("pwaNotify.unavailable"));
    } else {
      setMsg(t("pwaNotify.subscribeErr"));
    }
  };

  const later = () => {
    dismissPwaNotificationPromptForNow();
    setOpen(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[225] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 border-[#f5a623] bg-black p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-notify-title"
        dir="rtl"
      >
        <h2
          id="pwa-notify-title"
          className="mb-2 text-center text-base font-bold text-[#f5a623]"
        >
          {t("pwaNotify.title")}
        </h2>
        <p className="mb-2 text-center text-sm leading-relaxed text-gray-200">
          {t("pwaNotify.body")}
        </p>
        <p className="mb-4 text-center text-[11px] leading-relaxed text-gray-500">
          {t("pwaNotify.systemHint")}
        </p>
        {msg ? (
          <p className="mb-3 text-center text-xs text-amber-200/90">{msg}</p>
        ) : null}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void enable()}
            className="w-full rounded-xl bg-[#f5a623] py-3 text-sm font-bold text-black disabled:opacity-50"
          >
            {busy ? t("pwaNotify.enabling") : t("pwaNotify.enableBtn")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={later}
            className="w-full rounded-xl border-2 border-[#f5a623] py-3 text-sm font-semibold text-white"
          >
            {t("pwaNotify.laterBtn")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
