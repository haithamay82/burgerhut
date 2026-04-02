"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

const STORAGE_KEY = "pwa-popup-dismissed";
const DELAY_MS = 5000;

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

export default function PWAInstallPopup() {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  const deferredPromptRef = useRef(null);
  const showTimerRef = useRef(null);

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return;
    }
    if (dismissed) return;
    if (isStandaloneDisplay()) return;
    if (!isMobileDevice()) return;

    showTimerRef.current = window.setTimeout(() => {
      let stillDismissed = false;
      try {
        stillDismissed = localStorage.getItem(STORAGE_KEY) === "true";
      } catch {
        return;
      }
      if (stillDismissed) return;
      if (isStandaloneDisplay()) return;
      setVisible(true);
    }, DELAY_MS);

    return () => {
      if (showTimerRef.current != null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
  }, []);

  const handleClose = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* ignore quota / private mode */
    }
    setVisible(false);
  };

  const handleInstall = async () => {
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
      handleClose();
      return;
    }
    if (isIOS()) {
      window.alert(t("pwa.iosInstallHint"));
    } else {
      window.alert(t("pwa.androidInstallHint"));
    }
  };

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-end justify-center p-4">
      <div
        className="pointer-events-auto w-full max-w-md rounded-2xl border-2 border-[#f5a623] bg-black p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        dir="rtl"
      >
        <p
          id="pwa-install-title"
          className="mb-4 text-center text-base font-semibold leading-relaxed text-white"
        >
          רוצה להזמין מהר יותר? 📱
          <br />
          הוסף את Burger Hut למסך הבית
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full rounded-xl bg-[#f5a623] py-3 text-sm font-bold text-black transition-opacity hover:opacity-90"
            onClick={handleInstall}
          >
            הוסף עכשיו
          </button>
          <button
            type="button"
            className="w-full rounded-xl border-2 border-[#f5a623] py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5"
            onClick={handleClose}
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
