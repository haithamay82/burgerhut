/**
 * Ordering window: from ORDER_START_MIN until that day's closing time (Asia/Jerusalem),
 * using business hours from admin when available; otherwise 00:00–22:00 fallback.
 * To restrict again from 12:00: set ORDER_START_MIN to 12 * 60.
 */
const TZ = "Asia/Jerusalem";

/** 0 = allow from midnight until close; 12*60 = from 12:00 only */
const ORDER_START_MIN = 0;
/** Fallback end when schedule missing (minutes from midnight). */
const FALLBACK_END_MIN = 22 * 60;

/**
 * @param {Date} [date]
 * @returns {number} 0=Sun … 6=Sat in Jerusalem
 */
export function getJerusalemWeekday(date = new Date()) {
  const short = date.toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "short",
  });
  const MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return MAP[short] ?? 0;
}

/**
 * @param {Date} [date]
 * @returns {{ h: number, m: number }}
 */
export function getJerusalemHourMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const n = (type) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { h: n("hour"), m: n("minute") };
}

/**
 * @param {string} closeStr "HH:mm"
 * @returns {number | null} minutes from midnight
 */
export function parseCloseMinutes(closeStr) {
  if (typeof closeStr !== "string") return null;
  const [a, b] = closeStr.trim().split(":");
  const hh = parseInt(a, 10);
  const mm = parseInt(b, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * @param {Date} [date]
 * @param {{ weekday: number, enabled: boolean, open: string, close: string }[] | null | undefined} days
 * @returns {boolean}
 */
export function isOrderingAllowedAt(date = new Date(), days) {
  const { h, m } = getJerusalemHourMinute(date);
  const curMin = h * 60 + m;

  let endMin = FALLBACK_END_MIN;
  if (days && Array.isArray(days) && days.length === 7) {
    const wd = getJerusalemWeekday(date);
    const row = days.find((d) => d.weekday === wd);
    if (!row || !row.enabled) return false;
    const closeMin = parseCloseMinutes(row.close);
    if (closeMin === null || closeMin < ORDER_START_MIN) return false;
    endMin = closeMin;
  }

  return curMin >= ORDER_START_MIN && curMin <= endMin;
}

/**
 * @deprecated Use isOrderingAllowedAt(date, days) with schedule; kept for tests — fallback when no schedule.
 * @param {Date} [date]
 */
export function isWithinOrderingHours(date = new Date()) {
  return isOrderingAllowedAt(date, null);
}
