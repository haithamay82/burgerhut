/**
 * נרמול שדה «יום פתוח» מה־API/JSON — ב־JS ‎Boolean("false") === true
 * @param {unknown} val
 * @returns {boolean}
 */
export function coerceDayEnabled(val) {
  if (val === false || val === 0) return false;
  if (val === true || val === 1) return true;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (s === "false" || s === "0" || s === "") return false;
    if (s === "true" || s === "1") return true;
  }
  return Boolean(val);
}
