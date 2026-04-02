/** sessionStorage — הזמנה ממתינה (ביט/אשראי) ושחזור טיוטת checkout */
export const PENDING_ORDER_KEY = "burgerhut_pending_order";
export const CHECKOUT_RESUME_KEY = "burgerhut_checkout_resume";
/** נתונים לווטסאפ אחרי תשלום אשראי (נשמר לפני מעבר ל-Hyp) */
export const CARD_SUCCESS_SNAPSHOT_KEY = "burgerhut_card_success_snapshot";
/** נתונים לווטסאפ אחרי הצלחת הזמנה (מזומן/אשראי) למסך success */
export const SUCCESS_WA_SNAPSHOT_KEY = "burgerhut_success_wa_snapshot";
/** שחזור כפתור ווטסאפ אחרי ריענון/חזרה ממצלמה או מאפליקציה אחרת */
export const SUCCESS_WA_RESTORE_KEY = "burgerhut_success_wa_restore";
