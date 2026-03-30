import {
  PENDING_ORDER_KEY,
  CHECKOUT_RESUME_KEY,
} from "@/utils/checkoutSessionKeys";

/**
 * קורא את הזמנה תלויה מה-session, משחזר טיוטת checkout, ומסיר את המפתח.
 * לשימוש בחזרה ל-checkout אחרי כשל תשלום / ביטול — לא לפני מעבר לסולק.
 * @returns {{ items: any[] }}
 */
export function consumePendingOrderForCheckoutResume() {
  if (typeof window === "undefined") return { items: [] };
  const raw = window.sessionStorage.getItem(PENDING_ORDER_KEY);
  if (!raw) return { items: [] };
  try {
    const p = JSON.parse(raw);
    const items = Array.isArray(p.items) ? p.items : [];
    if (p.checkoutDraft && typeof p.checkoutDraft === "object") {
      window.sessionStorage.setItem(
        CHECKOUT_RESUME_KEY,
        JSON.stringify(p.checkoutDraft)
      );
    }
    window.sessionStorage.removeItem(PENDING_ORDER_KEY);
    return { items };
  } catch {
    return { items: [] };
  }
}
