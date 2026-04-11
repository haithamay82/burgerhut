const ADMIN_PUSH_DEVICE_LS = "burgerhut:admin-push-device-id";

/** אימות מזהה מהדפדפן (גם בשרת) — בלי תלות ב-Redis */
export function isValidPushClientId(id) {
  const s = String(id || "").trim();
  if (s.length < 16 || s.length > 128) return false;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  ) {
    return true;
  }
  return /^[a-zA-Z0-9_-]+$/.test(s);
}

/**
 * מזהה יציב לפרופיל דפדפן — שדה אחד ב-Redis למכשיר (מנוי Push לא מצטבר).
 */
export function getOrCreateAdminPushDeviceId() {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(ADMIN_PUSH_DEVICE_LS);
    if (id && isValidPushClientId(id)) return id.trim();
    const next =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `bh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 20)}`;
    window.localStorage.setItem(ADMIN_PUSH_DEVICE_LS, next);
    return next;
  } catch {
    return "";
  }
}
