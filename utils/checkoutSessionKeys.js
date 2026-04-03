/** sessionStorage — הזמנה ממתינה (ביט/אשראי) ושחזור טיוטת checkout */
export const PENDING_ORDER_KEY = "burgerhut_pending_order";
export const CHECKOUT_RESUME_KEY = "burgerhut_checkout_resume";
/** נתונים לווטסאפ אחרי תשלום אשראי (נשמר לפני מעבר ל-Hyp) */
export const CARD_SUCCESS_SNAPSHOT_KEY = "burgerhut_card_success_snapshot";
/** נתונים לווטסאפ אחרי הצלחת הזמנה (מזומן/אשראי) למסך success */
export const SUCCESS_WA_SNAPSHOT_KEY = "burgerhut_success_wa_snapshot";
/** שחזור כפתור ווטסאפ אחרי ריענון/חזרה ממצלמה או מאפליקציה אחרת */
export const SUCCESS_WA_RESTORE_KEY = "burgerhut_success_wa_restore";
/** המשתמש כבר פתח את ה-composer של ווטסאפ למסך success (מזומן/אשראי) — מניעת שליחה כפולה */
export const SUCCESS_WA_SENT_KEY = "burgerhut_success_wa_sent";
/** מספר הזמנה שכבר נלחץ עליה «שלח לווטסאפ» מעמוד ביט */
export const BIT_PAY_WA_SENT_ORDER_KEY = "burgerhut_bit_pay_wa_sent_order";
/** אחרי שליחת הזמנה בווטסאפ מביט — לצריכת קופון דחויה בעמוד success */
export const BIT_DEFERRED_COUPON_CLAIM_KEY = "burgerhut_bit_deferred_coupon_claim";

/**
 * מפתח יציב לעמוד success (תואם ל-SUCCESS_WA_RESTORE_KEY.matchKey).
 * @param {{ method?: string, orderOn?: string, hypReturn?: string }} p
 */
export function buildSuccessPageMatchKey(p) {
  const methodStr = String(p?.method || "");
  return `${methodStr}\u0001${String(p?.orderOn || "")}\u0001${String(p?.hypReturn || "")}`;
}
