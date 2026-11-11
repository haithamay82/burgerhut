/** האם האתר רץ כ־PWA מותקן (מסך הבית) — דפדפן רגיל מחזיר false */
export function isStandalonePwaDisplay() {
  if (typeof window === "undefined") return false;
  const mq = (mode) =>
    window.matchMedia?.(`(display-mode: ${mode})`)?.matches ?? false;
  return (
    mq("standalone") ||
    mq("fullscreen") ||
    mq("minimal-ui") ||
    window.navigator.standalone === true
  );
}

/** iPhone / iPad — Web Push עובד רק מאפליקציה שנוספה למסך הבית */
export function isAppleTouchDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = String(navigator.userAgent || "");
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ מדווח כ-Mac עם מגע
  return (
    navigator.platform === "MacIntel" &&
    Number(navigator.maxTouchPoints || 0) > 1
  );
}

/** באייפון/אייפד חייבים PWA מותקן כדי לרשום/לקבל Web Push */
export function customerPushRequiresInstalledPwa() {
  return isAppleTouchDevice() && !isStandalonePwaDisplay();
}
