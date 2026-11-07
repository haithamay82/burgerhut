import { promises as fs } from "fs";
import path from "path";
import { kvGetJson, kvSetJson } from "@/lib/kvStore";
import { jerusalemDayKeyFromDate } from "@/lib/adminAuth";
import {
  minutesBetweenHHmm,
  normalizeDayKey,
  parseHHmm,
  sumMinutesForMonth,
} from "@/utils/employeeHours";

export { formatHoursMinutes, sumMinutesForMonth } from "@/utils/employeeHours";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "employee-hours.json");
const KV_KEY = "burgerhut:employee-hours";

/** @type {{ entries: EmployeeHoursEntry[] } | null} */
let memoryStore = null;

/**
 * @typedef {{ dayKey: string, start: string, end: string, minutes: number, createdAt: string }} EmployeeHoursEntry
 */

export function getEmployeeHoursSecret() {
  return String(process.env.EMPLOYEE_HOURS_SECRET || "123321").trim();
}

/**
 * @param {string | string[] | undefined} headerRaw
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function authorizeEmployeeHours(headerRaw) {
  const header = String(
    Array.isArray(headerRaw) ? headerRaw[0] : headerRaw || ""
  ).trim();
  const secret = getEmployeeHoursSecret();
  if (!secret) {
    return { ok: false, reason: "not_configured" };
  }
  if (header === secret) return { ok: true };
  return { ok: false, reason: "unauthorized" };
}

function sortEntries(entries) {
  return [...entries].sort((a, b) =>
    String(b.dayKey).localeCompare(String(a.dayKey))
  );
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const dayKey = normalizeDayKey(raw.dayKey);
  const start = parseHHmm(raw.start);
  const end = parseHHmm(raw.end);
  const minutes = minutesBetweenHHmm(start || "", end || "");
  if (!dayKey || !start || !end || minutes == null || minutes <= 0) return null;
  return {
    dayKey,
    start,
    end,
    minutes,
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
}

/**
 * @returns {Promise<{ entries: EmployeeHoursEntry[] }>}
 */
export async function getEmployeeHoursStore() {
  const fromKv = await kvGetJson(KV_KEY);
  if (fromKv && typeof fromKv === "object" && Array.isArray(fromKv.entries)) {
    return {
      entries: sortEntries(
        fromKv.entries.map(normalizeEntry).filter(Boolean)
      ),
    };
  }
  if (memoryStore) {
    return {
      entries: sortEntries(memoryStore.entries.map((e) => ({ ...e }))),
    };
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    const entries = Array.isArray(parsed?.entries)
      ? parsed.entries.map(normalizeEntry).filter(Boolean)
      : [];
    return { entries: sortEntries(entries) };
  } catch {
    return { entries: [] };
  }
}

/**
 * @param {EmployeeHoursEntry[]} entries
 */
async function saveEmployeeHoursStore(entries) {
  const next = { entries: sortEntries(entries), updatedAt: Date.now() };
  const savedToKv = await kvSetJson(KV_KEY, next);
  if (savedToKv) {
    memoryStore = null;
    return next;
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
    memoryStore = null;
  } catch {
    memoryStore = { entries: next.entries };
  }
  return next;
}

export function jerusalemMonthKey(date = new Date()) {
  return jerusalemDayKeyFromDate(date).slice(0, 7);
}

/**
 * @param {{ dayKey: string, start: string, end: string }} input
 */
export async function addEmployeeHoursEntry(input) {
  const dayKey = normalizeDayKey(input.dayKey);
  const start = parseHHmm(input.start);
  const end = parseHHmm(input.end);
  const minutes = minutesBetweenHHmm(start || "", end || "");
  if (!dayKey) return { ok: false, error: "invalid_day" };
  if (!start || !end) return { ok: false, error: "invalid_time" };
  if (minutes == null || minutes <= 0) return { ok: false, error: "invalid_range" };

  const today = jerusalemDayKeyFromDate();
  if (dayKey > today) return { ok: false, error: "future_day" };

  const store = await getEmployeeHoursStore();
  if (store.entries.some((e) => e.dayKey === dayKey)) {
    return { ok: false, error: "already_exists" };
  }

  const entry = {
    dayKey,
    start,
    end,
    minutes,
    createdAt: new Date().toISOString(),
  };
  const nextEntries = [...store.entries, entry];
  await saveEmployeeHoursStore(nextEntries);
  return { ok: true, entry, entries: sortEntries(nextEntries) };
}

export { sumMinutesForMonth };
