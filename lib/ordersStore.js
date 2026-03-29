import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const FIRST_ORDER_NUMBER = 5000;

/** In-memory fallback (e.g. Vercel serverless FS limits). Not durable across cold starts. */
let memoryOrders = [];

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(ORDERS_FILE);
  } catch {
    await fs.writeFile(ORDERS_FILE, "[]", "utf8");
  }
}

function sumTotal(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, i) => {
    const q = Number(i.quantity) || 0;
    const p = Number(i.price) || 0;
    return s + p * q;
  }, 0);
}

function getNextOrderNumber(orders) {
  if (!Array.isArray(orders) || !orders.length) return FIRST_ORDER_NUMBER;
  let maxOrderNumber = FIRST_ORDER_NUMBER - 1;
  for (const order of orders) {
    const n = Number(order?.orderNumber);
    if (Number.isFinite(n) && n > maxOrderNumber) {
      maxOrderNumber = n;
    }
  }
  return Math.max(FIRST_ORDER_NUMBER, maxOrderNumber + 1);
}

export async function listOrders() {
  try {
    await ensureDataFile();
    const raw = await fs.readFile(ORDERS_FILE, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [...memoryOrders];
  }
}

/**
 * @param {{ customer: object, items: array, payment: string, total?: number, channel?: string, meta?: object }} payload
 */
export async function appendOrder(payload) {
  const id = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const total = sumTotal(payload.items);

  try {
    await ensureDataFile();
    const all = JSON.parse(await fs.readFile(ORDERS_FILE, "utf8") || "[]");
    if (!Array.isArray(all)) throw new Error("invalid store");
    const row = {
      id,
      orderNumber: getNextOrderNumber(all),
      createdAt: new Date().toISOString(),
      customer: payload.customer,
      items: payload.items,
      payment: payload.payment || "cash",
      total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : total,
      channel: payload.channel || "checkout",
      meta: payload.meta || {},
    };
    all.unshift(row);
    await fs.writeFile(ORDERS_FILE, JSON.stringify(all, null, 2), "utf8");
    return row;
  } catch {
    const row = {
      id,
      orderNumber: getNextOrderNumber(memoryOrders),
      createdAt: new Date().toISOString(),
      customer: payload.customer,
      items: payload.items,
      payment: payload.payment || "cash",
      total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : total,
      channel: payload.channel || "checkout",
      meta: payload.meta || {},
    };
    memoryOrders.unshift(row);
    return row;
  }
}

/**
 * @param {string} id
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function deleteOrderById(id) {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "invalid_id" };
  }
  try {
    await ensureDataFile();
    const all = JSON.parse(await fs.readFile(ORDERS_FILE, "utf8") || "[]");
    if (!Array.isArray(all)) throw new Error("invalid store");
    const next = all.filter((o) => o.id !== id);
    if (next.length === all.length) return { ok: false, error: "not_found" };
    await fs.writeFile(ORDERS_FILE, JSON.stringify(next, null, 2), "utf8");
    return { ok: true };
  } catch {
    const before = memoryOrders.length;
    memoryOrders = memoryOrders.filter((o) => o.id !== id);
    if (memoryOrders.length === before) return { ok: false, error: "not_found" };
    return { ok: true };
  }
}
