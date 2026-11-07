import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { kvGetJson, kvSetJson } from "@/lib/kvStore";
import { jerusalemDayKeyFromDate } from "@/lib/adminAuth";
import {
  costIlsForMinutes,
  minutesBetweenHHmm,
  normalizeDayKey,
  normalizeMoneyIls,
  parseHHmm,
  rateIlsForDay,
  sumCostIlsForEntries,
  sumMinutesForMonth,
} from "@/utils/employeeHours";

export {
  formatHoursMinutes,
  sumMinutesForMonth,
  rateIlsForDay,
  costIlsForMinutes,
  sumCostIlsForEntries,
} from "@/utils/employeeHours";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "employee-hours.json");
const KV_KEY = "burgerhut:employee-hours";

/**
 * @typedef {{ fromDayKey: string, rateIls: number, createdAt: string }} RateHistoryRow
 * @typedef {{ id: string, name: string, passwordHash: string, salt: string, createdAt: string, rateHistory: RateHistoryRow[], paidTotalIls: number }} EmployeeAccount
 * @typedef {{ employeeId: string, employeeName: string, dayKey: string, start: string, end: string, minutes: number, createdAt: string, updatedAt?: string }} EmployeeHoursEntry
 * @typedef {{ employees: EmployeeAccount[], entries: EmployeeHoursEntry[] }} EmployeeHoursData
 */

/** @type {EmployeeHoursData | null} */
let memoryStore = null;

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function hashPassword(password, salt) {
  return crypto
    .createHash("sha256")
    .update(`${salt}:${String(password)}`)
    .digest("hex");
}

function normalizeName(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizePassword(raw) {
  return String(raw || "").trim();
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const byDay = String(b.dayKey).localeCompare(String(a.dayKey));
    if (byDay !== 0) return byDay;
    return String(a.employeeName || "").localeCompare(
      String(b.employeeName || ""),
      "he"
    );
  });
}

function normalizeRateHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const rows = [];
  for (const r of raw) {
    const fromDayKey = normalizeDayKey(r?.fromDayKey);
    const rateIls = normalizeMoneyIls(r?.rateIls);
    if (!fromDayKey || rateIls == null) continue;
    rows.push({
      fromDayKey,
      rateIls,
      createdAt: String(r?.createdAt || new Date().toISOString()),
    });
  }
  rows.sort((a, b) => a.fromDayKey.localeCompare(b.fromDayKey));
  return rows;
}

function normalizeEmployee(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const name = normalizeName(raw.name);
  const passwordHash = String(raw.passwordHash || "").trim();
  const salt = String(raw.salt || "").trim();
  if (!id || !name || !passwordHash || !salt) return null;
  const paidTotalIls = normalizeMoneyIls(raw.paidTotalIls) ?? 0;
  return {
    id,
    name,
    passwordHash,
    salt,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    rateHistory: normalizeRateHistory(raw.rateHistory),
    paidTotalIls,
  };
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const dayKey = normalizeDayKey(raw.dayKey);
  const start = parseHHmm(raw.start);
  const end = parseHHmm(raw.end);
  const minutes = minutesBetweenHHmm(start || "", end || "");
  if (!dayKey || !start || !end || minutes == null || minutes <= 0) return null;
  const employeeId = String(raw.employeeId || "").trim();
  const employeeName = normalizeName(raw.employeeName) || "—";
  return {
    employeeId,
    employeeName,
    dayKey,
    start,
    end,
    minutes,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    ...(raw.updatedAt ? { updatedAt: String(raw.updatedAt) } : {}),
  };
}

function emptyData() {
  return { employees: [], entries: [] };
}

/**
 * @returns {Promise<EmployeeHoursData>}
 */
export async function getEmployeeHoursData() {
  const fromKv = await kvGetJson(KV_KEY);
  if (fromKv && typeof fromKv === "object") {
    return {
      employees: Array.isArray(fromKv.employees)
        ? fromKv.employees.map(normalizeEmployee).filter(Boolean)
        : [],
      entries: sortEntries(
        (Array.isArray(fromKv.entries) ? fromKv.entries : [])
          .map(normalizeEntry)
          .filter(Boolean)
      ),
    };
  }
  if (memoryStore) {
    return {
      employees: memoryStore.employees.map((e) => ({
        ...e,
        rateHistory: [...(e.rateHistory || [])],
      })),
      entries: sortEntries(memoryStore.entries.map((e) => ({ ...e }))),
    };
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return {
      employees: Array.isArray(parsed?.employees)
        ? parsed.employees.map(normalizeEmployee).filter(Boolean)
        : [],
      entries: sortEntries(
        (Array.isArray(parsed?.entries) ? parsed.entries : [])
          .map(normalizeEntry)
          .filter(Boolean)
      ),
    };
  } catch {
    return emptyData();
  }
}

/** @param {EmployeeHoursData} data */
async function saveEmployeeHoursData(data) {
  const next = {
    employees: Array.isArray(data.employees) ? data.employees : [],
    entries: sortEntries(Array.isArray(data.entries) ? data.entries : []),
    updatedAt: Date.now(),
  };
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
    memoryStore = {
      employees: next.employees,
      entries: next.entries,
    };
  }
  return next;
}

export async function getEmployeeHoursStore() {
  const data = await getEmployeeHoursData();
  return { entries: data.entries };
}

/**
 * @param {string | string[] | undefined} headerRaw
 */
export async function authorizeEmployeeHours(headerRaw) {
  const password = normalizePassword(
    Array.isArray(headerRaw) ? headerRaw[0] : headerRaw || ""
  );
  if (!password) return { ok: false, reason: "unauthorized" };
  const found = await findEmployeeByPassword(password);
  if (!found) return { ok: false, reason: "unauthorized" };
  return { ok: true, employee: { id: found.id, name: found.name } };
}

export async function findEmployeeByPassword(password) {
  const pwd = normalizePassword(password);
  if (!pwd) return null;
  const data = await getEmployeeHoursData();
  for (const emp of data.employees) {
    if (hashPassword(pwd, emp.salt) === emp.passwordHash) return emp;
  }
  return null;
}

export async function registerEmployeeAccount(input) {
  const name = normalizeName(input.name);
  const password = normalizePassword(input.password);
  if (name.length < 2) return { ok: false, error: "invalid_name" };
  if (password.length < 4) return { ok: false, error: "invalid_password" };

  const data = await getEmployeeHoursData();
  const nameLower = name.toLowerCase();
  if (data.employees.some((e) => e.name.toLowerCase() === nameLower)) {
    return { ok: false, error: "name_taken" };
  }
  for (const emp of data.employees) {
    if (hashPassword(password, emp.salt) === emp.passwordHash) {
      return { ok: false, error: "password_taken" };
    }
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const employee = {
    id: newId("emp"),
    name,
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
    rateHistory: [],
    paidTotalIls: 0,
  };
  await saveEmployeeHoursData({
    employees: [...data.employees, employee],
    entries: data.entries,
  });
  return {
    ok: true,
    employee: { id: employee.id, name: employee.name },
  };
}

export async function loginEmployeeAccount(password) {
  const emp = await findEmployeeByPassword(password);
  if (!emp) return { ok: false, error: "unauthorized" };
  return { ok: true, employee: { id: emp.id, name: emp.name } };
}

export function jerusalemMonthKey(date = new Date()) {
  return jerusalemDayKeyFromDate(date).slice(0, 7);
}

export function filterEntriesForEmployee(entries, employeeId) {
  const id = String(employeeId || "").trim();
  return (Array.isArray(entries) ? entries : []).filter(
    (e) => e.employeeId === id
  );
}

export function publicEntry(entry, rateHistory = []) {
  if (!entry) return null;
  const rateIls = rateIlsForDay(rateHistory, entry.dayKey);
  const costIls = costIlsForMinutes(entry.minutes, rateIls);
  return {
    employeeId: entry.employeeId,
    employeeName: entry.employeeName,
    dayKey: entry.dayKey,
    start: entry.start,
    end: entry.end,
    minutes: entry.minutes,
    rateIls,
    costIls,
    createdAt: entry.createdAt,
    ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
  };
}

/**
 * @param {EmployeeAccount} emp
 * @param {EmployeeHoursEntry[]} entries
 * @param {string} [monthKey]
 */
export function buildEmployeeFinance(emp, entries, monthKey) {
  const month = monthKey || jerusalemMonthKey();
  const scoped = filterEntriesForEmployee(entries, emp.id);
  const currentRateIls = rateIlsForDay(emp.rateHistory, jerusalemDayKeyFromDate());
  const monthMinutes = sumMinutesForMonth(scoped, month);
  const monthCostIls = sumCostIlsForEntries(scoped, emp.rateHistory, month);
  const totalEarnedIls = sumCostIlsForEntries(scoped, emp.rateHistory, null);
  const paidTotalIls = normalizeMoneyIls(emp.paidTotalIls) ?? 0;
  const balanceIls = Math.round((totalEarnedIls - paidTotalIls) * 100) / 100;
  return {
    id: emp.id,
    name: emp.name,
    createdAt: emp.createdAt,
    currentRateIls,
    rateHistory: emp.rateHistory.map((r) => ({ ...r })),
    monthKey: month,
    monthMinutes,
    monthCostIls,
    totalEarnedIls,
    paidTotalIls,
    balanceIls,
  };
}

export function publicEmployeeProfile(emp, entries, monthKey) {
  return buildEmployeeFinance(emp, entries, monthKey);
}

/**
 * @param {EmployeeHoursData} data
 * @param {string | null} employeeId
 * @param {string} [monthKey]
 */
export function buildHoursPayload(data, employeeId = null, monthKey) {
  const month = monthKey || jerusalemMonthKey();
  const empMap = new Map(data.employees.map((e) => [e.id, e]));
  const scoped = employeeId
    ? filterEntriesForEmployee(data.entries, employeeId)
    : data.entries;
  const entries = scoped.map((e) =>
    publicEntry(e, empMap.get(e.employeeId)?.rateHistory || [])
  );
  let monthMinutes = 0;
  let monthCostIls = 0;
  if (employeeId) {
    const emp = empMap.get(employeeId);
    if (emp) {
      const fin = buildEmployeeFinance(emp, data.entries, month);
      monthMinutes = fin.monthMinutes;
      monthCostIls = fin.monthCostIls;
    }
  } else {
    monthMinutes = sumMinutesForMonth(data.entries, month);
    for (const emp of data.employees) {
      monthCostIls += sumCostIlsForEntries(
        filterEntriesForEmployee(data.entries, emp.id),
        emp.rateHistory,
        month
      );
    }
    monthCostIls = Math.round(monthCostIls * 100) / 100;
  }
  return {
    ok: true,
    todayKey: jerusalemDayKeyFromDate(),
    monthKey: month,
    monthMinutes,
    monthCostIls,
    entries,
  };
}

export async function addEmployeeHoursEntry(input) {
  const employeeId = String(input.employeeId || "").trim();
  const employeeName = normalizeName(input.employeeName);
  const dayKey = normalizeDayKey(input.dayKey);
  const start = parseHHmm(input.start);
  const end = parseHHmm(input.end);
  const minutes = minutesBetweenHHmm(start || "", end || "");
  if (!employeeId || !employeeName) return { ok: false, error: "unauthorized" };
  if (!dayKey) return { ok: false, error: "invalid_day" };
  if (!start || !end) return { ok: false, error: "invalid_time" };
  if (minutes == null || minutes <= 0) return { ok: false, error: "invalid_range" };

  const today = jerusalemDayKeyFromDate();
  if (dayKey !== today) return { ok: false, error: "not_today" };

  const data = await getEmployeeHoursData();
  if (
    data.entries.some(
      (e) => e.employeeId === employeeId && e.dayKey === dayKey
    )
  ) {
    return { ok: false, error: "already_exists" };
  }

  const entry = {
    employeeId,
    employeeName,
    dayKey,
    start,
    end,
    minutes,
    createdAt: new Date().toISOString(),
  };
  const nextEntries = [...data.entries, entry];
  await saveEmployeeHoursData({
    employees: data.employees,
    entries: nextEntries,
  });
  return { ok: true, entry, data: { ...data, entries: sortEntries(nextEntries) } };
}

export async function updateEmployeeHoursEntry(input) {
  const employeeId = String(input.employeeId || "").trim();
  const today = jerusalemDayKeyFromDate();
  const dayKey = normalizeDayKey(input.dayKey) || today;
  const start = parseHHmm(input.start);
  const end = parseHHmm(input.end);
  const minutes = minutesBetweenHHmm(start || "", end || "");
  if (!employeeId) return { ok: false, error: "unauthorized" };
  if (dayKey !== today) return { ok: false, error: "not_today" };
  if (!start || !end) return { ok: false, error: "invalid_time" };
  if (minutes == null || minutes <= 0) return { ok: false, error: "invalid_range" };

  const data = await getEmployeeHoursData();
  const idx = data.entries.findIndex(
    (e) => e.employeeId === employeeId && e.dayKey === today
  );
  if (idx < 0) return { ok: false, error: "not_found" };

  const prev = data.entries[idx];
  const entry = {
    ...prev,
    start,
    end,
    minutes,
    updatedAt: new Date().toISOString(),
  };
  const nextEntries = data.entries.map((e, i) => (i === idx ? entry : e));
  await saveEmployeeHoursData({
    employees: data.employees,
    entries: nextEntries,
  });
  return {
    ok: true,
    entry,
    data: { ...data, entries: sortEntries(nextEntries) },
  };
}

export async function deleteEmployeeAccount(employeeId) {
  const id = String(employeeId || "").trim();
  if (!id) return { ok: false, error: "missing_employee" };
  const data = await getEmployeeHoursData();
  if (!data.employees.some((e) => e.id === id)) {
    return { ok: false, error: "not_found" };
  }
  const next = {
    employees: data.employees.filter((e) => e.id !== id),
    entries: data.entries.filter((e) => e.employeeId !== id),
  };
  await saveEmployeeHoursData(next);
  return { ok: true, data: next };
}

/**
 * Set hourly rate effective from today (not retroactive).
 * If a rate for today already exists, replace it.
 */
export async function setEmployeeHourlyRate(employeeId, rateIlsRaw) {
  const id = String(employeeId || "").trim();
  const rateIls = normalizeMoneyIls(rateIlsRaw);
  if (!id) return { ok: false, error: "missing_employee" };
  if (rateIls == null) return { ok: false, error: "invalid_rate" };

  const today = jerusalemDayKeyFromDate();
  const data = await getEmployeeHoursData();
  const idx = data.employees.findIndex((e) => e.id === id);
  if (idx < 0) return { ok: false, error: "not_found" };

  const emp = data.employees[idx];
  const withoutToday = emp.rateHistory.filter((r) => r.fromDayKey !== today);
  const rateHistory = [
    ...withoutToday,
    { fromDayKey: today, rateIls, createdAt: new Date().toISOString() },
  ].sort((a, b) => a.fromDayKey.localeCompare(b.fromDayKey));

  const nextEmployees = data.employees.map((e, i) =>
    i === idx ? { ...e, rateHistory } : e
  );
  const next = { employees: nextEmployees, entries: data.entries };
  await saveEmployeeHoursData(next);
  return { ok: true, data: next };
}

/** Set absolute "paid so far" amount. */
export async function setEmployeePaidTotal(employeeId, paidTotalRaw) {
  const id = String(employeeId || "").trim();
  const paidTotalIls = normalizeMoneyIls(paidTotalRaw);
  if (!id) return { ok: false, error: "missing_employee" };
  if (paidTotalIls == null) return { ok: false, error: "invalid_amount" };

  const data = await getEmployeeHoursData();
  const idx = data.employees.findIndex((e) => e.id === id);
  if (idx < 0) return { ok: false, error: "not_found" };

  const nextEmployees = data.employees.map((e, i) =>
    i === idx ? { ...e, paidTotalIls } : e
  );
  const next = { employees: nextEmployees, entries: data.entries };
  await saveEmployeeHoursData(next);
  return { ok: true, data: next };
}

export function monthMinutesFor(entries, monthKey, employeeId = null) {
  const scoped = employeeId
    ? filterEntriesForEmployee(entries, employeeId)
    : entries;
  return sumMinutesForMonth(scoped, monthKey);
}
