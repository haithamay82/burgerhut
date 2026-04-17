/** sessionStorage — הזמנה ממתינה (ביט/אשראי) ושחזור טיוטת checkout */
export const PENDING_ORDER_KEY = "burgerhut_pending_order";
export const CHECKOUT_RESUME_KEY = "burgerhut_checkout_resume";
/** localStorage — שם וטלפון לשחזור בצ'קאאוט (רק אם הלקוח לחץ «שמור לפעם הבאה») */
export const CHECKOUT_SAVED_CONTACT_KEY = "burgerhut_checkout_saved_contact";
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

/** sessionStorage נפרד לכל טאב — אחרי Hyp לעיתים נפתח /success בטאב חדש בלי ה-snapshot */
export function readCardSuccessSnapshotRaw() {
  if (typeof window === "undefined") return null;
  try {
    const s = window.sessionStorage.getItem(CARD_SUCCESS_SNAPSHOT_KEY);
    if (s) return s;
  } catch {
    /* ignore */
  }
  try {
    return window.localStorage.getItem(CARD_SUCCESS_SNAPSHOT_KEY);
  } catch {
    return null;
  }
}

/** שמירה לפני מעבר ל-Hyp — גם session וגם local */
export function writeCardSuccessSnapshot(data) {
  if (typeof window === "undefined") return;
  const raw = typeof data === "string" ? data : JSON.stringify(data);
  try {
    window.sessionStorage.setItem(CARD_SUCCESS_SNAPSHOT_KEY, raw);
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.setItem(CARD_SUCCESS_SNAPSHOT_KEY, raw);
  } catch {
    /* ignore */
  }
}

export function clearCardSuccessSnapshot() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CARD_SUCCESS_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.removeItem(CARD_SUCCESS_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

export function hasValidCardSuccessSnapshot() {
  const raw = readCardSuccessSnapshotRaw();
  if (!raw) return false;
  try {
    const snap = JSON.parse(raw);
    return Boolean(snap?.customer && Array.isArray(snap.items) && snap.items.length);
  } catch {
    return false;
  }
}

export function readSuccessWaRestoreRaw() {
  if (typeof window === "undefined") return null;
  try {
    const s = window.sessionStorage.getItem(SUCCESS_WA_RESTORE_KEY);
    if (s) return s;
  } catch {
    /* ignore */
  }
  try {
    return window.localStorage.getItem(SUCCESS_WA_RESTORE_KEY);
  } catch {
    return null;
  }
}

export function writeSuccessWaRestore(payload) {
  if (typeof window === "undefined") return;
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  try {
    window.sessionStorage.setItem(SUCCESS_WA_RESTORE_KEY, raw);
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.setItem(SUCCESS_WA_RESTORE_KEY, raw);
  } catch {
    /* ignore */
  }
}

export function clearSuccessWaRestore() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SUCCESS_WA_RESTORE_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.removeItem(SUCCESS_WA_RESTORE_KEY);
  } catch {
    /* ignore */
  }
}
