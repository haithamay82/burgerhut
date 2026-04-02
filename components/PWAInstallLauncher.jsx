"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useLocale } from "@/contexts/LocaleContext";

const HIDE_LAUNCHER_PREFIXES = [
  "/checkout",
  "/success",
  "/cancel",
  "/payment-error",
  "/pay/",
  "/admin",
];

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isMobileDevice() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const mobileUA =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const narrow =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 767px)").matches;
  return mobileUA || narrow;
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (typeof navigator !== "undefined" && "standalone" in navigator) {
    return /** @type {{ standalone?: boolean }} */ (navigator).standalone === true;
  }
  return false;
}

export default function PWAInstallLauncher() {
  const { t } = useLocale();
  const router = useRouter();
  const deferredPromptRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const path = router?.pathname || "";
  const hideOnThisPage = HIDE_LAUNCHER_PREFIXES.some((p) => path.startsWith(p));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let deferredPrompt = null;

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      deferredPrompt = e;
      deferredPromptRef.current = e;
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      deferredPrompt = null;
      deferredPromptRef.current = null;
    };
  }, []);

  const runInstall = async () => {
    const dp = deferredPromptRef.current;
    if (dp && typeof dp.prompt === "function") {
      try {
        await dp.prompt();
        if (dp.userChoice && typeof dp.userChoice.then === "function") {
          await dp.userChoice.catch(() => {});
        }
      } catch {
        /* user dismissed or prompt failed */
      }
      deferredPromptRef.current = null;
      setConfirmOpen(false);
      return;
    }
    if (isIOS()) {
      window.alert(t("pwa.iosInstallHint"));
    } else {
      window.alert(t("pwa.androidInstallHint"));
    }
    setConfirmOpen(false);
  };

  if (!mounted) {
    return <span className="h-9 w-9 shrink-0" aria-hidden />;
  }

  if (
    hideOnThisPage ||
    isStandaloneDisplay() ||
    !isMobileDevice()
  ) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#f5a623] bg-black/80 text-[#f5a623] shadow-md transition-colors hover:bg-[#f5a623]/15"
        aria-label={t("pwa.launcherAria")}
        title={t("pwa.launcherAria")}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      </button>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border-2 border-[#f5a623] bg-black p-5 shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pwa-confirm-title"
            aria-describedby="pwa-confirm-desc"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="pwa-confirm-title"
              className="mb-2 text-center text-base font-bold text-[#f5a623]"
            >
              {t("pwa.confirmTitle")}
            </h2>
            <p
              id="pwa-confirm-desc"
              className="mb-5 text-center text-sm leading-relaxed text-gray-200"
            >
              {t("pwa.confirmBody")}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="w-full rounded-xl bg-[#f5a623] py-3 text-sm font-bold text-black transition-opacity hover:opacity-90"
                onClick={() => void runInstall()}
              >
                {t("pwa.confirmInstall")}
              </button>
              <button
                type="button"
                className="w-full rounded-xl border-2 border-[#f5a623] py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5"
                onClick={() => setConfirmOpen(false)}
              >
                {t("pwa.confirmCancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
