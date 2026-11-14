const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Work day stays on the previous calendar date through 01:00 (inclusive). */
export const EMPLOYEE_HOURS_DAY_END_MINUTES = 60;

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

function jerusalemNowMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const n = (type) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return n("hour") * 60 + n("minute");
}

function jerusalemCalendarDayKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

function shiftDayKey(dayKey, deltaDays) {
  const [y, m, d] = String(dayKey)
    .split("-")
    .map((x) => Number(x));
  if (!y || !m || !d) return dayKey;
  const utc = new Date(Date.UTC(y, m - 1, d + Number(deltaDays || 0)));
  return utc.toISOString().slice(0, 10);
}

/**
 * Employee reporting day: after midnight until 01:00 still counts as yesterday.
 * @param {Date} [date]
 */
export function jerusalemEmployeeWorkDayKey(date = new Date()) {
  const cal = jerusalemCalendarDayKey(date);
  if (jerusalemNowMinutes(date) <= EMPLOYEE_HOURS_DAY_END_MINUTES) {
    return shiftDayKey(cal, -1);
  }
  return cal;
}

/**
 * Overnight end (end <= start) may not be after 01:00.
 * @param {string} start
 * @param {string} end
 */
export function isOvernightEndPastLimit(start, end) {
  const a = parseHHmm(start);
  const b = parseHHmm(end);
  if (!a || !b) return false;
  const [sh, sm] = a.split(":").map(Number);
  const [eh, em] = b.split(":").map(Number);
  const startM = sh * 60 + sm;
  const endM = eh * 60 + em;
  if (endM > startM) return false;
  return endM > EMPLOYEE_HOURS_DAY_END_MINUTES;
}

/**
 * True when end time is still ahead of "now" (Asia/Jerusalem),
 * relative to the employee work day (rolls at 01:00).
 * @param {string} start
 * @param {string} end
 * @param {Date} [date]
 */
export function isEndTimeInTheFuture(start, end, date = new Date()) {
  const a = parseHHmm(start);
  const b = parseHHmm(end);
  if (!a || !b) return false;
  const [sh, sm] = a.split(":").map(Number);
  const [eh, em] = b.split(":").map(Number);
  const startM = sh * 60 + sm;
  const endM = eh * 60 + em;
  const overnight = endM <= startM;
  const endAbsFromWorkDay = overnight ? endM + 24 * 60 : endM;
  const workDay = jerusalemEmployeeWorkDayKey(date);
  const calendarDay = jerusalemCalendarDayKey(date);
  const nowM = jerusalemNowMinutes(date);
  const nowAbsFromWorkDay =
    calendarDay === workDay ? nowM : nowM + 24 * 60;
  return endAbsFromWorkDay > nowAbsFromWorkDay;
}

/** Monday = closed for employee hour reporting (employee work day). */
export function isJerusalemMonday(date = new Date()) {
  const workDay = jerusalemEmployeeWorkDayKey(date);
  const [y, m, d] = workDay.split("-").map(Number);
  if (!y || !m || !d) return false;
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const short = utc.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  return short === "Mon";
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
