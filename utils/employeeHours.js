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

/** @param {unknown} raw */
export function normalizeMoneyIls(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Effective hourly rate on a day from rate history (fromDayKey ascending).
 * @param {{ fromDayKey: string, rateIls: number }[]} rateHistory
 * @param {string} dayKey
 */
export function rateIlsForDay(rateHistory, dayKey) {
  const key = normalizeDayKey(dayKey);
  if (!key) return 0;
  const rows = (Array.isArray(rateHistory) ? rateHistory : [])
    .filter((r) => normalizeDayKey(r?.fromDayKey) && Number(r?.rateIls) >= 0)
    .map((r) => ({
      fromDayKey: normalizeDayKey(r.fromDayKey),
      rateIls: normalizeMoneyIls(r.rateIls) ?? 0,
    }))
    .filter((r) => r.fromDayKey && r.fromDayKey <= key)
    .sort((a, b) => a.fromDayKey.localeCompare(b.fromDayKey));
  if (!rows.length) return 0;
  return rows[rows.length - 1].rateIls;
}

/** @param {number} minutes @param {number} rateIls */
export function costIlsForMinutes(minutes, rateIls) {
  const m = Math.max(0, Number(minutes) || 0);
  const rate = normalizeMoneyIls(rateIls) ?? 0;
  return Math.round((m / 60) * rate * 100) / 100;
}

/**
 * @param {{ dayKey: string, minutes: number }[]} entries
 * @param {{ fromDayKey: string, rateIls: number }[]} rateHistory
 * @param {string} [monthKey]
 */
export function sumCostIlsForEntries(entries, rateHistory, monthKey = null) {
  const prefix =
    monthKey && /^\d{4}-\d{2}$/.test(String(monthKey).slice(0, 7))
      ? String(monthKey).slice(0, 7)
      : null;
  let sum = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    if (prefix && !String(e.dayKey).startsWith(prefix)) continue;
    const rate = rateIlsForDay(rateHistory, e.dayKey);
    sum += costIlsForMinutes(e.minutes, rate);
  }
  return Math.round(sum * 100) / 100;
}
