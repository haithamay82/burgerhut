/**
 * שמירת קוד מנהל אחרי «טען» — sessionStorage + localStorage (נייד אחרי מצלמה).
 */

export const ADMIN_ORDERS_SECRET_SESSION_KEY = "burgerhut:admin-orders-secret";
export const ADMIN_ORDERS_SECRET_LOCAL_KEY = "burgerhut:admin-orders-secret-ls";
export const ADMIN_PROMO_PANEL_SESSION_KEY = "burgerhut:admin-promo-panel";
export const ADMIN_SLIDER_PANEL_SESSION_KEY = "burgerhut:admin-slider-panel";

export function readPersistedAdminSecret() {
  if (typeof window === "undefined") return "";
  try {
    const ses = String(
      window.sessionStorage.getItem(ADMIN_ORDERS_SECRET_SESSION_KEY) || ""
    ).trim();
    if (ses) return ses;
    return String(
      window.localStorage.getItem(ADMIN_ORDERS_SECRET_LOCAL_KEY) || ""
    ).trim();
  } catch {
    return "";
  }
}

export function writePersistedAdminSecret(value) {
  if (typeof window === "undefined") return;
  const v = String(value || "").trim();
  try {
    if (v) {
      window.sessionStorage.setItem(ADMIN_ORDERS_SECRET_SESSION_KEY, v);
      window.localStorage.setItem(ADMIN_ORDERS_SECRET_LOCAL_KEY, v);
    } else {
      window.sessionStorage.removeItem(ADMIN_ORDERS_SECRET_SESSION_KEY);
      window.localStorage.removeItem(ADMIN_ORDERS_SECRET_LOCAL_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function resolveAdminSecret(current) {
  const trimmed = String(current || "").trim();
  if (trimmed) return trimmed;
  return readPersistedAdminSecret();
}
