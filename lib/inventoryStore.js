import { promises as fs } from "fs";
import path from "path";
import { kvGetJson, kvSetJson } from "@/lib/kvStore";
import { getManagedInventoryProductIds } from "@/lib/inventoryManagedIds";
import {
  computeAutoUnavailableBurgerIds,
  PATTY_GRAMS_ORDER,
} from "@/utils/burgerPattyPrep";

const DATA_DIR = path.join(process.cwd(), "data");
const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");
const KV_KEY = "burgerhut:inventory";

/** @type {{ unavailableIds: string[], pattyStock: Record<number, number> | null } | null} */
let memoryPayload = null;

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(INVENTORY_FILE);
  } catch {
    await fs.writeFile(
      INVENTORY_FILE,
      JSON.stringify({ unavailableIds: [], pattyStock: null }, null, 2),
      "utf8"
    );
  }
}

/**
 * @param {unknown} o
 * @returns {Record<number, number>}
 */
export function normalizePattyStock(o) {
  /** @type {Record<number, number>} */
  const out = { 120: 0, 160: 0, 200: 0, 220: 0 };
  if (!o || typeof o !== "object") return out;
  for (const g of PATTY_GRAMS_ORDER) {
    const v = Number(/** @type {Record<string, unknown>} */ (o)[String(g)]);
    out[g] =
      Number.isFinite(v) && v >= 0 ? Math.min(1e7, Math.floor(v)) : 0;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {{ unavailableIds: string[], pattyStock: Record<number, number> | null }}
 */
function normalizePayload(raw) {
  const idsRaw = raw && typeof raw === "object" ? raw.unavailableIds : null;
  const unavailableIds = Array.isArray(idsRaw)
    ? [...new Set(idsRaw.filter((x) => typeof x === "string"))]
    : [];
  let pattyStock = null;
  if (
    raw &&
    typeof raw === "object" &&
    raw.pattyStock != null &&
    typeof raw.pattyStock === "object"
  ) {
    pattyStock = normalizePattyStock(raw.pattyStock);
  }
  return { unavailableIds, pattyStock };
}

/**
 * @returns {Promise<{ unavailableIds: string[], pattyStock: Record<number, number> | null }>}
 */
export async function getInventoryPayload() {
  const fromKv = await kvGetJson(KV_KEY);
  if (fromKv && typeof fromKv === "object") {
    return normalizePayload(fromKv);
  }
  try {
    await ensureDataFile();
    const raw = await fs.readFile(INVENTORY_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return normalizePayload(parsed);
  } catch {
    if (memoryPayload) return normalizePayload(memoryPayload);
    return { unavailableIds: [], pattyStock: null };
  }
}

/**
 * מזהים לא זמינים למנהל (ידני) ∪ חסימה אוטומטית בגלל מלאי קציצות (כש־pattyStock מוגדר).
 * מסננים מזהים שלא קיימים בתפריט המאוחד (למשל מנה שהוסרה מ־menuData אך נשארה ב־KV).
 * @returns {Promise<string[]>}
 */
export async function getUnavailableIds() {
  const { unavailableIds, pattyStock } = await getInventoryPayload();
  const allowed = await getManagedInventoryProductIds();
  const manual = unavailableIds.filter((id) => allowed.has(id));
  const auto =
    pattyStock == null ? [] : computeAutoUnavailableBurgerIds(pattyStock);
  const autoFiltered = auto.filter((id) => allowed.has(id));
  return [...new Set([...manual, ...autoFiltered])];
}

/**
 * @returns {Promise<Record<number, number> | null>}
 */
export async function getPattyStock() {
  const { pattyStock } = await getInventoryPayload();
  return pattyStock;
}

/**
 * @param {{ unavailableIds: string[], pattyStock: Record<number, number> | null }} payload
 */
export async function setInventoryPayload(payload) {
  const next = normalizePayload(payload);
  const toWrite = {
    unavailableIds: next.unavailableIds,
    pattyStock: next.pattyStock,
  };
  const savedToKv = await kvSetJson(KV_KEY, toWrite);
  if (savedToKv) {
    memoryPayload = null;
    return;
  }
  try {
    await ensureDataFile();
    await fs.writeFile(
      INVENTORY_FILE,
      JSON.stringify(toWrite, null, 2),
      "utf8"
    );
  } catch {
    memoryPayload = toWrite;
  }
}

/**
 * @param {string[]} ids — רק ידני
 */
export async function setUnavailableIds(ids) {
  const cur = await getInventoryPayload();
  await setInventoryPayload({
    unavailableIds: ids,
    pattyStock: cur.pattyStock,
  });
}

/**
 * עדכון מלאי קציצות בלבד (שומר unavailableIds קיים).
 * @param {Record<number, number> | null} stock — null לכיבוי מעקב
 */
export async function setPattyStockOnly(stock) {
  const cur = await getInventoryPayload();
  await setInventoryPayload({
    unavailableIds: cur.unavailableIds,
    pattyStock: stock == null ? null : normalizePattyStock(stock),
  });
}

/**
 * ניכוי אחרי הזמנה (כש־pattyStock פעיל).
 * @param {Record<number, number>} counts
 * @returns {Promise<boolean>}
 */
export async function deductPattyStockForOrder(counts) {
  const cur = await getInventoryPayload();
  if (cur.pattyStock == null) return true;
  const stock = normalizePattyStock(cur.pattyStock);
  for (const g of PATTY_GRAMS_ORDER) {
    const need = Number(counts[g]) || 0;
    stock[g] = Math.max(0, (Number(stock[g]) || 0) - need);
  }
  await setInventoryPayload({
    unavailableIds: cur.unavailableIds,
    pattyStock: stock,
  });
  return true;
}
