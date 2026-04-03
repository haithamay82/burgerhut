/**
 * Ordering window (Asia/Jerusalem) from business-hours.json:
 * customers may order from 10:00 until that day's close, even when kitchen `open` is later (e.g. 16:00).
 * Overnight shifts (e.g. 22:00–02:00): pre-orders from 10:00 until evening `open`, then service until close next morning.
 * Fallback 10:00–22:00 when schedule missing.
 */
const TZ = "Asia/Jerusalem";

/** Earliest time (minutes from midnight) customers may place an order on an enabled day. */
const ORDER_WINDOW_EARLIEST_MIN = 10 * 60;

/** Fallback when schedule missing (minutes from midnight). */
const FALLBACK_START_MIN = ORDER_WINDOW_EARLIEST_MIN;
const FALLBACK_END_MIN = 22 * 60;

function rowByWeekday(days, wd) {
  if (!days || !Array.isArray(days)) return null;
  return days.find((d) => d.weekday === wd) ?? days[wd] ?? null;
}

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
 * @param {string} timeStr "HH:mm"
 * @returns {number | null} minutes from midnight
 */
export function parseHHmmToMinutes(timeStr) {
  if (typeof timeStr !== "string") return null;
  const [a, b] = timeStr.trim().split(":");
  const hh = parseInt(a, 10);
  const mm = parseInt(b, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/** @param {string} closeStr "HH:mm" */
export function parseCloseMinutes(closeStr) {
  return parseHHmmToMinutes(closeStr);
}

/**
 * Same calendar day: close after open. Overnight: close time is "earlier" (next morning, e.g. 22:00–02:00).
 * @param {string} openStr
 * @param {string} closeStr
 */
export function isOvernightSpan(openStr, closeStr) {
  const openM = parseHHmmToMinutes(openStr);
  const closeM = parseHHmmToMinutes(closeStr);
  if (openM === null || closeM === null) return false;
  return closeM < openM;
}

function isInOvernightMorningTail(row, curMin) {
  if (!row?.enabled) return false;
  const openM = parseHHmmToMinutes(row.open);
  const closeM = parseHHmmToMinutes(row.close);
  if (openM === null || closeM === null) return false;
  if (openM === closeM) return false;
  if (closeM >= openM) return false;
  return curMin <= closeM;
}

/** Admin-defined service window (kitchen open): between `open` and `close` only. */
function isInTodayBusinessWindow(row, curMin) {
  if (!row?.enabled) return false;
  const openM = parseHHmmToMinutes(row.open);
  const closeM = parseHHmmToMinutes(row.close);
  if (openM === null || closeM === null) return false;
  if (openM === closeM) return false;
  if (closeM > openM) {
    return curMin >= openM && curMin <= closeM;
  }
  return curMin >= openM;
}

/**
 * Whether the restaurant is in the admin-defined open–close window (for UI status / green dot).
 * Without a 7-day schedule, uses the same 10:00–22:00 fallback as ordering when data is missing.
 * @param {Date} [date]
 * @param {{ weekday: number, enabled: boolean, open: string, close: string }[] | null | undefined} days
 * @returns {boolean}
 */
export function isRestaurantOpenAt(date = new Date(), days) {
  const { h, m } = getJerusalemHourMinute(date);
  const curMin = h * 60 + m;

  if (days && Array.isArray(days) && days.length === 7) {
    const wd = getJerusalemWeekday(date);
    const prevWd = (wd - 1 + 7) % 7;
    const prevRow = rowByWeekday(days, prevWd);
    if (isInOvernightMorningTail(prevRow, curMin)) return true;
    const todayRow = rowByWeekday(days, wd);
    return isInTodayBusinessWindow(todayRow, curMin);
  }

  return curMin >= FALLBACK_START_MIN && curMin <= FALLBACK_END_MIN;
}

/**
 * Whether the customer may order now for today's schedule row (Jerusalem minutes from midnight).
 * Uses 10:00 as the earliest order time; upper bound is always the day's closing time (same calendar day or overnight tail via prevRow).
 */
function isInTodayOrderingWindow(row, curMin) {
  if (!row?.enabled) return false;
  const openM = parseHHmmToMinutes(row.open);
  const closeM = parseHHmmToMinutes(row.close);
  if (openM === null || closeM === null) return false;
  if (openM === closeM) return false;
  if (closeM > openM) {
    return curMin >= ORDER_WINDOW_EARLIEST_MIN && curMin <= closeM;
  }
  if (curMin >= openM) return true;
  return curMin >= ORDER_WINDOW_EARLIEST_MIN && curMin < openM;
}

/**
 * @param {Date} [date]
 * @param {{ weekday: number, enabled: boolean, open: string, close: string }[] | null | undefined} days
 * @returns {boolean}
 */
export function isOrderingAllowedAt(date = new Date(), days) {
  const { h, m } = getJerusalemHourMinute(date);
  const curMin = h * 60 + m;

  if (days && Array.isArray(days) && days.length === 7) {
    const wd = getJerusalemWeekday(date);
    const prevWd = (wd - 1 + 7) % 7;
    const prevRow = rowByWeekday(days, prevWd);
    if (isInOvernightMorningTail(prevRow, curMin)) return true;
    const todayRow = rowByWeekday(days, wd);
    return isInTodayOrderingWindow(todayRow, curMin);
  }

  return curMin >= FALLBACK_START_MIN && curMin <= FALLBACK_END_MIN;
}

/**
 * @deprecated Use isOrderingAllowedAt(date, days) with schedule; fallback 10:00–22:00 when no schedule.
 * @param {Date} [date]
 */
export function isWithinOrderingHours(date = new Date()) {
  return isOrderingAllowedAt(date, null);
}
