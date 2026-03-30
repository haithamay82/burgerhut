/**
 * Ordering window: each day's open–close (Asia/Jerusalem) from business-hours.json;
 * fallback 10:00–22:00 when schedule missing.
 */
const TZ = "Asia/Jerusalem";

/** Fallback when schedule missing (minutes from midnight). */
const FALLBACK_START_MIN = 10 * 60;
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
 * @param {Date} [date]
 * @param {{ weekday: number, enabled: boolean, open: string, close: string }[] | null | undefined} days
 * @returns {boolean}
 */
export function isOrderingAllowedAt(date = new Date(), days) {
  const { h, m } = getJerusalemHourMinute(date);
  const curMin = h * 60 + m;

  if (days && Array.isArray(days) && days.length === 7) {
    const wd = getJerusalemWeekday(date);
    const row = days.find((d) => d.weekday === wd);
    if (!row || !row.enabled) return false;
    const startMin =
      parseHHmmToMinutes(row.open) ?? FALLBACK_START_MIN;
    const closeMin = parseHHmmToMinutes(row.close);
    if (closeMin === null || closeMin < startMin) return false;
    return curMin >= startMin && curMin <= closeMin;
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
