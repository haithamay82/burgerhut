import { isValidPushClientId } from "@/utils/adminPushClientId";

const CUSTOMER_PUSH_DEVICE_LS = "burgerhut:customer-push-device-id";

export { isValidPushClientId };

/**
 * מזהה יציב לפרופיל דפדפן — שדה אחד ב-Redis למכשיר (מנוי Push לקוחות).
 */
export function getOrCreateCustomerPushDeviceId() {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(CUSTOMER_PUSH_DEVICE_LS);
    if (id && isValidPushClientId(id)) return id.trim();
    const next =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `bhc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 20)}`;
    window.localStorage.setItem(CUSTOMER_PUSH_DEVICE_LS, next);
    return next;
  } catch {
    return "";
  }
}
