import { isStandalonePwaDisplay } from "@/utils/pwaDisplay";

export const PWA_NOTIFY_DISMISS_UNTIL_LS = "bh_pwa_notify_dismiss_until_v1";
export const PWA_JUST_INSTALLED_SS = "bh_pwa_just_installed_v1";

const DISMISS_MS = 24 * 60 * 60 * 1000;

export function markPwaJustInstalled() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PWA_JUST_INSTALLED_SS, "1");
  } catch {
    /* ignore */
  }
}

export function clearPwaJustInstalledFlag() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PWA_JUST_INSTALLED_SS);
  } catch {
    /* ignore */
  }
}

function isDismissedForNow() {
  try {
    const until = Number(window.localStorage.getItem(PWA_NOTIFY_DISMISS_UNTIL_LS));
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

export function dismissPwaNotificationPromptForNow() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PWA_NOTIFY_DISMISS_UNTIL_LS,
      String(Date.now() + DISMISS_MS)
    );
  } catch {
    /* ignore */
  }
  clearPwaJustInstalledFlag();
}

/** @param {string} [pathname] */
export function shouldShowPwaNotificationPrompt(pathname = "") {
  if (typeof window === "undefined") return false;
  if (typeof Notification === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (Notification.permission !== "default") return false;
  if (pathname.startsWith("/admin")) return false;

  let justInstalled = false;
  try {
    justInstalled = window.sessionStorage.getItem(PWA_JUST_INSTALLED_SS) === "1";
  } catch {
    /* ignore */
  }

  if (justInstalled) return true;
  if (isStandalonePwaDisplay() && !isDismissedForNow()) return true;
  return false;
}
