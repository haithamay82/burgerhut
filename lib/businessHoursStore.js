import { promises as fs } from "fs";
import path from "path";
import { getDefaultBusinessSchedule } from "@/utils/businessHoursDefaults";
import { kvGetJson, kvSetJson } from "@/lib/kvStore";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "business-hours.json");
const KV_KEY = "burgerhut:business-hours";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Normalize to HH:mm: leading hour zero, strip optional seconds/ms
 * (some browsers send 9:00 or 10:00:00 from time inputs).
 */
function padTime(timeStr) {
  const t0 = String(timeStr ?? "").trim();
  if (!t0) return "";
  const m = t0.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!m) return "";
  const h = Number(m[1]);
  const mm = m[2];
  if (!Number.isFinite(h) || h < 0 || h > 23) return "";
  if (!/^[0-5]\d$/.test(mm)) return "";
  return `${String(h).padStart(2, "0")}:${mm}`;
}

/** @type {{ weekday: number, enabled: boolean, open: string, close: string }[] | null} */
let memoryBusinessHours = null;

function isSameClockTime(open, close) {
  return String(open) === String(close);
}

/** @returns {{ weekday: number, enabled: boolean, open: string, close: string }[]} */
export function defaultBusinessSchedule() {
  return getDefaultBusinessSchedule();
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, days: { weekday: number, enabled: boolean, open: string, close: string }[] } | { ok: false, error: string }}
 */
export function parseAndValidateDays(body) {
  const raw = body?.days;
  if (!Array.isArray(raw) || raw.length !== 7) {
    return { ok: false, error: "invalid_days" };
  }
  const fallbackDays = defaultBusinessSchedule();
  const out = [];
  for (let i = 0; i < 7; i++) {
    const row = raw[i];
    const enabled = Boolean(row?.enabled);
    let open = padTime(row?.open ?? "");
    let close = padTime(row?.close ?? "");
    if (!enabled) {
      if (!TIME_RE.test(open) || !TIME_RE.test(close)) {
        open = fallbackDays[i].open;
        close = fallbackDays[i].close;
      }
    } else {
      if (!TIME_RE.test(open) || !TIME_RE.test(close)) {
        return { ok: false, error: "invalid_time" };
      }
    }
    if (isSameClockTime(open, close)) {
      return { ok: false, error: "open_after_close" };
    }
    out.push({ weekday: i, enabled, open, close });
  }
  return { ok: true, days: out };
}

/** @returns {Promise<{ weekday: number, enabled: boolean, open: string, close: string }[]>} */
export async function getBusinessHours() {
  const defaults = defaultBusinessSchedule();
  const fromKv = await kvGetJson(KV_KEY);
  if (fromKv?.days && Array.isArray(fromKv.days)) {
    return defaults.map((def, i) => {
      const row = fromKv.days.find((d) => Number(d?.weekday) === i) ?? fromKv.days[i];
      if (!row || typeof row !== "object") return def;
      const open = padTime(row.open ?? "");
      const close = padTime(row.close ?? "");
      if (
        !TIME_RE.test(open) ||
        !TIME_RE.test(close) ||
        isSameClockTime(open, close)
      ) {
        return def;
      }
      return {
        weekday: i,
        enabled: Boolean(row.enabled),
        open,
        close,
      };
    });
  }
  if (memoryBusinessHours && Array.isArray(memoryBusinessHours)) {
    return defaults.map((def, i) => {
      const row =
        memoryBusinessHours.find((d) => Number(d?.weekday) === i) ||
        memoryBusinessHours[i];
      if (!row || typeof row !== "object") return def;
      const open = padTime(row.open ?? "");
      const close = padTime(row.close ?? "");
      if (
        !TIME_RE.test(open) ||
        !TIME_RE.test(close) ||
        isSameClockTime(open, close)
      ) {
        return def;
      }
      return {
        weekday: i,
        enabled: Boolean(row.enabled),
        open,
        close,
      };
    });
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.days || !Array.isArray(parsed.days)) return defaults;
    return defaults.map((def, i) => {
      const row =
        parsed.days.find((d) => Number(d?.weekday) === i) ?? parsed.days[i];
      if (!row || typeof row !== "object") return def;
      const open = padTime(row.open ?? "");
      const close = padTime(row.close ?? "");
      if (
        !TIME_RE.test(open) ||
        !TIME_RE.test(close) ||
        isSameClockTime(open, close)
      ) {
        return def;
      }
      return {
        weekday: i,
        enabled: Boolean(row.enabled),
        open,
        close,
      };
    });
  } catch {
    return defaults;
  }
}

/**
 * @param {{ weekday: number, enabled: boolean, open: string, close: string }[]} days
 */
/** @returns {Promise<boolean>} true if persisted to KV or disk (not memory-only). */
export async function setBusinessHours(days) {
  const savedToKv = await kvSetJson(KV_KEY, { days, updatedAt: Date.now() });
  if (savedToKv) {
    memoryBusinessHours = null;
    return true;
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify({ days }, null, 2), "utf8");
    memoryBusinessHours = null;
    return true;
  } catch {
    memoryBusinessHours = Array.isArray(days)
      ? days.map((d, i) => ({
          weekday: Number.isFinite(Number(d?.weekday)) ? Number(d.weekday) : i,
          enabled: Boolean(d?.enabled),
          open: String(d?.open ?? ""),
          close: String(d?.close ?? ""),
        }))
      : null;
    return false;
  }
}
