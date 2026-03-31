import { promises as fs } from "fs";
import path from "path";
import { getDefaultBusinessSchedule } from "@/utils/businessHoursDefaults";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "business-hours.json");

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** @type {{ weekday: number, enabled: boolean, open: string, close: string }[] | null} */
let memoryBusinessHours = null;

function compareTime(a, b) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return ah * 60 + am - (bh * 60 + bm);
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
  const out = [];
  for (let i = 0; i < 7; i++) {
    const row = raw[i];
    const enabled = Boolean(row?.enabled);
    const open = String(row?.open ?? "").trim();
    const close = String(row?.close ?? "").trim();
    if (!TIME_RE.test(open) || !TIME_RE.test(close)) {
      return { ok: false, error: "invalid_time" };
    }
    if (compareTime(open, close) >= 0) {
      return { ok: false, error: "open_after_close" };
    }
    out.push({ weekday: i, enabled, open, close });
  }
  return { ok: true, days: out };
}

/** @returns {Promise<{ weekday: number, enabled: boolean, open: string, close: string }[]>} */
export async function getBusinessHours() {
  const defaults = defaultBusinessSchedule();
  if (memoryBusinessHours && Array.isArray(memoryBusinessHours)) {
    return defaults.map((def, i) => {
      const row =
        memoryBusinessHours.find((d) => Number(d?.weekday) === i) ||
        memoryBusinessHours[i];
      if (!row || typeof row !== "object") return def;
      const open = String(row.open ?? "").trim();
      const close = String(row.close ?? "").trim();
      if (
        !TIME_RE.test(open) ||
        !TIME_RE.test(close) ||
        compareTime(open, close) >= 0
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
      const open = String(row.open ?? "").trim();
      const close = String(row.close ?? "").trim();
      if (
        !TIME_RE.test(open) ||
        !TIME_RE.test(close) ||
        compareTime(open, close) >= 0
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
export async function setBusinessHours(days) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify({ days }, null, 2), "utf8");
    memoryBusinessHours = null;
  } catch {
    memoryBusinessHours = Array.isArray(days)
      ? days.map((d, i) => ({
          weekday: Number.isFinite(Number(d?.weekday)) ? Number(d.weekday) : i,
          enabled: Boolean(d?.enabled),
          open: String(d?.open ?? ""),
          close: String(d?.close ?? ""),
        }))
      : null;
  }
}
