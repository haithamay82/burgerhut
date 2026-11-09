/** הזמנה פתוחה (ממתינה/בהכנה) — שחזור מסך סטטוס אחרי סגירת האתר */
export const ACTIVE_ORDER_LS_KEY = "bh_active_order_v1";
/** בסשן הנוכחי המשתמש בחר להמשיך לתפריט — בלי הפניה כפויה */
export const ACTIVE_ORDER_BROWSE_SS = "bh_active_order_browse_v1";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const OPEN_STATUSES = new Set(["pending", "preparing"]);

/**
 * @param {{ orderNumber?: unknown, method?: unknown }} p
 */
export function saveActiveOrderResume(p) {
  if (typeof window === "undefined") return;
  const orderNumber =
    p?.orderNumber != null && String(p.orderNumber).trim() !== ""
      ? String(p.orderNumber).trim()
      : "";
  if (!/^\d{3,8}$/.test(orderNumber)) return;
  const methodRaw = String(p?.method || "").trim().toLowerCase();
  const method =
    methodRaw === "card" || methodRaw === "bit" || methodRaw === "cash"
      ? methodRaw
      : "cash";
  const payload = {
    v: 1,
    orderNumber,
    method,
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(ACTIVE_ORDER_LS_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** @returns {{ orderNumber: string, method: string, savedAt: number } | null} */
export function readActiveOrderResume() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_ORDER_LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    const orderNumber = String(data.orderNumber || "").trim();
    if (!/^\d{3,8}$/.test(orderNumber)) {
      window.localStorage.removeItem(ACTIVE_ORDER_LS_KEY);
      return null;
    }
    const savedAt = Number(data.savedAt) || 0;
    if (!savedAt || Date.now() - savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(ACTIVE_ORDER_LS_KEY);
      return null;
    }
    const methodRaw = String(data.method || "cash").trim().toLowerCase();
    const method =
      methodRaw === "card" || methodRaw === "bit" || methodRaw === "cash"
        ? methodRaw
        : "cash";
    return { orderNumber, method, savedAt };
  } catch {
    return null;
  }
}

export function clearActiveOrderResume() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_ORDER_LS_KEY);
  } catch {
    /* ignore */
  }
  clearActiveOrderBrowseMode();
}

/** משתמש בחר לנווט באתר — לא להפנות בכוח למסך סטטוס בסשן הזה */
export function enableActiveOrderBrowseMode() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ACTIVE_ORDER_BROWSE_SS, "1");
  } catch {
    /* ignore */
  }
}

export function clearActiveOrderBrowseMode() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ACTIVE_ORDER_BROWSE_SS);
  } catch {
    /* ignore */
  }
}

export function isActiveOrderBrowseMode() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(ACTIVE_ORDER_BROWSE_SS) === "1";
  } catch {
    return false;
  }
}

/** @param {string | null | undefined} status */
export function isOpenFulfillmentStatus(status) {
  return OPEN_STATUSES.has(String(status || ""));
}

/**
 * @param {{ orderNumber: string, method?: string }} p
 */
export function buildActiveOrderSuccessHref(p) {
  const on = encodeURIComponent(String(p.orderNumber || "").trim());
  const method = encodeURIComponent(
    String(p.method || "cash").trim() || "cash"
  );
  return `/success?method=${method}&on=${on}&resume=1`;
}
