/** Session-only (cleared when browser/tab closes) */
export const EMPLOYEE_HOURS_SESSION_KEY = "burgerhut:employee-hours-secret";
/** Persistent remember-me on this device */
export const EMPLOYEE_HOURS_LOCAL_KEY = "burgerhut:employee-hours-secret-ls";

/**
 * @returns {string}
 */
export function readEmployeeHoursSecret() {
  if (typeof window === "undefined") return "";
  try {
    const remembered = String(
      window.localStorage.getItem(EMPLOYEE_HOURS_LOCAL_KEY) || ""
    ).trim();
    if (remembered) return remembered;
    return String(
      window.sessionStorage.getItem(EMPLOYEE_HOURS_SESSION_KEY) || ""
    ).trim();
  } catch {
    return "";
  }
}

/**
 * @param {string} password
 * @param {boolean} remember - true → localStorage; false → sessionStorage only
 */
export function writeEmployeeHoursSecret(password, remember) {
  if (typeof window === "undefined") return;
  const s = String(password || "").trim();
  try {
    if (!s) {
      window.sessionStorage.removeItem(EMPLOYEE_HOURS_SESSION_KEY);
      window.localStorage.removeItem(EMPLOYEE_HOURS_LOCAL_KEY);
      return;
    }
    if (remember) {
      window.localStorage.setItem(EMPLOYEE_HOURS_LOCAL_KEY, s);
      window.sessionStorage.setItem(EMPLOYEE_HOURS_SESSION_KEY, s);
    } else {
      window.localStorage.removeItem(EMPLOYEE_HOURS_LOCAL_KEY);
      window.sessionStorage.setItem(EMPLOYEE_HOURS_SESSION_KEY, s);
    }
  } catch {
    /* ignore */
  }
}

export function clearEmployeeHoursSecret() {
  writeEmployeeHoursSecret("", false);
}

export function hasRememberedEmployeeHoursSecret() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(
      String(window.localStorage.getItem(EMPLOYEE_HOURS_LOCAL_KEY) || "").trim()
    );
  } catch {
    return false;
  }
}
