"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

/**
 * Google app (G) and some in-app browsers — no reliable «Add to Home Screen».
 * Chrome on iOS (CriOS) does support it; do not match CriOS here.
 */
function needsOpenInSafariOnIOS() {
  if (!isIOS()) return false;
  const ua = navigator.userAgent || "";
  /** GSA = אפליקציית Google (חיפוש); דפדפנים מובנים בלי «הוסף למסך הבית» */
  return /GSA\/|FBAN|FBAV|Instagram|Line\/|MicroMessenger|KAKAOTALK/i.test(ua);
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
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
  const [iosGuide, setIosGuide] = useState(
    /** @type {"inapp" | "safari" | null} */ (null)
  );
  const [copyHint, setCopyHint] = useState(
    /** @type {"ok" | "fail" | null} */ (null)
  );

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
      setIosGuide(needsOpenInSafariOnIOS() ? "inapp" : "safari");
    } else {
      window.alert(t("pwa.androidInstallHint"));
    }
    setConfirmOpen(false);
  };

  const siteUrl =
    typeof window !== "undefined" ? `${window.location.origin}/` : "";

  const copySiteUrl = async () => {
    if (!siteUrl) return;
    const ok = await copyTextToClipboard(siteUrl);
    setCopyHint(ok ? "ok" : "fail");
    window.setTimeout(() => setCopyHint(null), 5000);
  };

  if (!mounted) {
    return (
      <span
        className="inline-block h-[3.25rem] w-10 shrink-0"
        aria-hidden
      />
    );
  }

  if (
    hideOnThisPage ||
    isStandaloneDisplay() ||
    !isMobileDevice()
  ) {
    return null;
  }

  const iosGuideModal =
    iosGuide && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[221] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            role="presentation"
            onClick={() => {
              setIosGuide(null);
              setCopyHint(null);
            }}
          >
            <div
              className="max-h-[min(90vh,32rem)] w-full max-w-sm overflow-y-auto rounded-2xl border-2 border-[#f5a623] bg-black p-5 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pwa-ios-guide-title"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="pwa-ios-guide-title"
                className="mb-2 text-center text-base font-bold text-[#f5a623]"
              >
                {iosGuide === "inapp"
                  ? t("pwa.iosInAppBrowserTitle")
                  : t("pwa.iosSafariGuideTitle")}
              </h2>
              {iosGuide === "inapp" ? (
                <>
                  <p className="mb-3 text-sm leading-relaxed text-gray-200">
                    {t("pwa.iosInAppBrowserLead")}
                  </p>
                  <ol className="mb-4 list-decimal space-y-2 pr-5 text-sm leading-relaxed text-gray-200">
                    <li>{t("pwa.iosInAppBrowserStep1")}</li>
                    <li>{t("pwa.iosInAppBrowserStep2")}</li>
                    <li>{t("pwa.iosInAppBrowserStep3")}</li>
                  </ol>
                  <p className="mb-2 break-all text-center text-[11px] text-gray-500">
                    {siteUrl}
                  </p>
                  <button
                    type="button"
                    className="mb-3 w-full rounded-xl bg-[#f5a623] py-3 text-sm font-bold text-black transition-opacity hover:opacity-90"
                    onClick={() => void copySiteUrl()}
                  >
                    {t("pwa.iosCopyLinkButton")}
                  </button>
                  {copyHint === "ok" ? (
                    <p className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-2 text-center text-xs leading-snug text-emerald-100">
                      {t("pwa.iosCopyLinkDone")}
                    </p>
                  ) : null}
                  {copyHint === "fail" ? (
                    <p className="mb-3 rounded-lg border border-amber-600/50 bg-amber-950/30 p-2 text-center text-xs leading-snug text-amber-100">
                      {t("pwa.iosCopyLinkFail")}{" "}
                      <span className="font-mono text-[11px]">{siteUrl}</span>
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mb-5 whitespace-pre-line text-center text-sm leading-relaxed text-gray-200">
                  {t("pwa.iosInstallHint")}
                </p>
              )}
              <button
                type="button"
                className="w-full rounded-xl border-2 border-[#f5a623] py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5"
                onClick={() => {
                  setIosGuide(null);
                  setCopyHint(null);
                }}
              >
                {t("pwa.iosGuideClose")}
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  const modal =
    confirmOpen && typeof document !== "undefined"
      ? createPortal(
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
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="pwa-install-launcher-attention flex w-[3.25rem] shrink-0 flex-col items-center gap-0.5">
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
        <span className="w-full text-center text-[9px] font-semibold leading-tight text-[#f5a623]/90">
          {t("pwa.launcherCaption")}
        </span>
      </div>
      {modal}
      {iosGuideModal}
    </>
  );
}
