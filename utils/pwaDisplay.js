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
