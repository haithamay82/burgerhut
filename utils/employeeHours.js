const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** @param {unknown} raw */
export function parseHHmm(raw) {
  const s = String(raw || "").trim();
  if (!HHMM_RE.test(s)) return null;
  return s;
}

/**
 * @param {string} start
 * @param {string} end
 * @returns {number | null}
 */
export function minutesBetweenHHmm(start, end) {
  const a = parseHHmm(start);
  const b = parseHHmm(end);
  if (!a || !b) return null;
  const [sh, sm] = a.split(":").map(Number);
  const [eh, em] = b.split(":").map(Number);
  let startM = sh * 60 + sm;
  let endM = eh * 60 + em;
  if (endM <= startM) endM += 24 * 60;
  return endM - startM;
}

/** @param {number} minutes */
export function formatHoursMinutes(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return { hours: h, minutes: rem, totalMinutes: m };
}

/** @param {unknown} dayKey */
export function normalizeDayKey(dayKey) {
  const s = String(dayKey || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * @param {{ dayKey?: string, minutes?: number }[]} entries
 * @param {string} [monthKey] YYYY-MM
 */
export function sumMinutesForMonth(entries, monthKey) {
  const prefix = String(monthKey || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(prefix)) return 0;
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => String(e.dayKey).startsWith(prefix))
    .reduce((sum, e) => sum + (Number(e.minutes) || 0), 0);
}
