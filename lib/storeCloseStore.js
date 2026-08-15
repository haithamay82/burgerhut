import { promises as fs } from "fs";
import path from "path";
import { kvGetJson, kvSetJson } from "@/lib/kvStore";
import {
  isRestaurantOpenAt,
  jerusalemBusinessShiftDayKey,
} from "@/utils/orderingHours";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "store-close.json");
const KV_KEY = "burgerhut:store-close";

/** @type {{ closedShiftDayKey: string | null, updatedAt: number } | null} */
let memoryClose = null;

function normalizeKey(raw) {
  const s = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function getManualStoreCloseRecord() {
  const fromKv = await kvGetJson(KV_KEY);
  if (fromKv && typeof fromKv === "object") {
    return {
      closedShiftDayKey: normalizeKey(fromKv.closedShiftDayKey),
      updatedAt: Number(fromKv.updatedAt) || 0,
    };
  }
  if (memoryClose) return { ...memoryClose };
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return {
      closedShiftDayKey: normalizeKey(parsed?.closedShiftDayKey),
      updatedAt: Number(parsed?.updatedAt) || 0,
    };
  } catch {
    return { closedShiftDayKey: null, updatedAt: 0 };
  }
}

export async function setManualStoreClose(closedShiftDayKey) {
  const next = {
    closedShiftDayKey: normalizeKey(closedShiftDayKey),
    updatedAt: Date.now(),
  };
  const savedToKv = await kvSetJson(KV_KEY, next);
  if (savedToKv) {
    memoryClose = null;
    return next;
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
    memoryClose = null;
  } catch {
    memoryClose = next;
  }
  return next;
}

export async function isManualStoreClosedNow(days, date = new Date()) {
  if (!isRestaurantOpenAt(date, days)) return false;
  const rec = await getManualStoreCloseRecord();
  if (!rec.closedShiftDayKey) return false;
  return rec.closedShiftDayKey === jerusalemBusinessShiftDayKey(date, days);
}
