import { promises as fs } from "fs";
import path from "path";
import { isKvEnabled, kvGetJson, kvSetJson } from "@/lib/kvStore";

const DATA_DIR = path.join(process.cwd(), "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const FIRST_ORDER_NUMBER = 5000;
const KV_KEY = "burgerhut:orders";

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

function getRetentionDays() {
  const n = Number(process.env.ORDER_RETENTION_DAYS);
  if (!Number.isFinite(n) || n <= 0) return 120;
  return Math.floor(n);
}

function getMaxStoredOrders() {
  const n = Number(process.env.ORDER_MAX_STORED);
  if (!Number.isFinite(n) || n <= 0) return 3000;
  return Math.floor(n);
}

function toMs(ts) {
  const x = new Date(ts).getTime();
  return Number.isFinite(x) ? x : 0;
}

function normalizeOrders(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o) => o && typeof o === "object")
    .map((o) => ({ ...o }))
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
}

function pruneOrders(raw) {
  const now = Date.now();
  const cutoff = now - getRetentionDays() * 24 * 60 * 60 * 1000;
  const maxRows = getMaxStoredOrders();
  const all = normalizeOrders(raw);
  const keptByAge = all.filter((o) => toMs(o.createdAt) >= cutoff);
  return keptByAge.slice(0, maxRows);
}

function parseKvOrdersShape(kvPayload) {
  if (Array.isArray(kvPayload)) {
    return { orders: normalizeOrders(kvPayload), nextOrderNumber: null };
  }
  if (kvPayload && typeof kvPayload === "object" && Array.isArray(kvPayload.orders)) {
    return {
      orders: normalizeOrders(kvPayload.orders),
      nextOrderNumber: Number(kvPayload.nextOrderNumber) || null,
    };
  }
  return { orders: null, nextOrderNumber: null };
}

async function loadFromKv() {
  if (!isKvEnabled()) return { orders: null, nextOrderNumber: null };
  const raw = await kvGetJson(KV_KEY);
  return parseKvOrdersShape(raw);
}

async function saveToKv(orders, nextOrderNumber) {
  if (!isKvEnabled()) return false;
  return kvSetJson(KV_KEY, {
    orders,
    nextOrderNumber: Number(nextOrderNumber) || getNextOrderNumber(orders),
    updatedAt: Date.now(),
  });
}

export async function listOrders() {
  const fromKv = await loadFromKv();
  if (Array.isArray(fromKv.orders)) {
    const pruned = pruneOrders(fromKv.orders);
    if (pruned.length !== fromKv.orders.length) {
      const nextHint =
        fromKv.nextOrderNumber ||
        getNextOrderNumber(fromKv.orders);
      await saveToKv(pruned, Math.max(nextHint, getNextOrderNumber(pruned)));
    }
    return pruned;
  }
  try {
    await ensureDataFile();
    const raw = await fs.readFile(ORDERS_FILE, "utf8");
    const parsed = JSON.parse(raw || "[]");
    const normalized = normalizeOrders(parsed);
    const pruned = pruneOrders(normalized);
    if (isKvEnabled() && pruned.length) {
      await saveToKv(pruned, getNextOrderNumber(normalized));
    }
    return pruned;
  } catch {
    const pruned = pruneOrders(memoryOrders);
    return [...pruned];
  }
}

/**
 * @param {{ customer: object, items: array, payment: string, total?: number, channel?: string, meta?: object }} payload
 */
export async function appendOrder(payload) {
  const id = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const total = sumTotal(payload.items);

  const fromKv = await loadFromKv();
  if (Array.isArray(fromKv.orders)) {
    const base = pruneOrders(fromKv.orders);
    const nextByData = getNextOrderNumber(base);
    const nextOrderNumber = Math.max(
      nextByData,
      Number(fromKv.nextOrderNumber) || FIRST_ORDER_NUMBER
    );
    const row = {
      id,
      orderNumber: nextOrderNumber,
      createdAt: new Date().toISOString(),
      customer: payload.customer,
      items: payload.items,
      payment: payload.payment || "cash",
      total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : total,
      channel: payload.channel || "checkout",
      meta: payload.meta || {},
    };
    const nextOrders = pruneOrders([row, ...base]);
    const saved = await saveToKv(nextOrders, nextOrderNumber + 1);
    if (saved) return row;
  }

  try {
    await ensureDataFile();
    const all = normalizeOrders(JSON.parse(await fs.readFile(ORDERS_FILE, "utf8") || "[]"));
    if (!Array.isArray(all)) throw new Error("invalid store");
    const base = pruneOrders(all);
    const row = {
      id,
      orderNumber: getNextOrderNumber(base),
      createdAt: new Date().toISOString(),
      customer: payload.customer,
      items: payload.items,
      payment: payload.payment || "cash",
      total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : total,
      channel: payload.channel || "checkout",
      meta: payload.meta || {},
    };
    const next = pruneOrders([row, ...base]);
    await fs.writeFile(ORDERS_FILE, JSON.stringify(next, null, 2), "utf8");
    if (isKvEnabled()) {
      await saveToKv(next, row.orderNumber + 1);
    }
    return row;
  } catch {
    const base = pruneOrders(memoryOrders);
    const row = {
      id,
      orderNumber: getNextOrderNumber(base),
      createdAt: new Date().toISOString(),
      customer: payload.customer,
      items: payload.items,
      payment: payload.payment || "cash",
      total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : total,
      channel: payload.channel || "checkout",
      meta: payload.meta || {},
    };
    memoryOrders = pruneOrders([row, ...base]);
    if (isKvEnabled()) {
      await saveToKv(memoryOrders, row.orderNumber + 1);
    }
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

  const fromKv = await loadFromKv();
  if (Array.isArray(fromKv.orders)) {
    const before = fromKv.orders.length;
    const next = fromKv.orders.filter((o) => o.id !== id);
    if (next.length === before) return { ok: false, error: "not_found" };
    const nextCounter = Math.max(
      Number(fromKv.nextOrderNumber) || FIRST_ORDER_NUMBER,
      getNextOrderNumber(next)
    );
    const saved = await saveToKv(pruneOrders(next), nextCounter);
    if (saved) return { ok: true };
  }

  try {
    await ensureDataFile();
    const all = normalizeOrders(JSON.parse(await fs.readFile(ORDERS_FILE, "utf8") || "[]"));
    if (!Array.isArray(all)) throw new Error("invalid store");
    const next = all.filter((o) => o.id !== id);
    if (next.length === all.length) return { ok: false, error: "not_found" };
    const pruned = pruneOrders(next);
    await fs.writeFile(ORDERS_FILE, JSON.stringify(pruned, null, 2), "utf8");
    if (isKvEnabled()) {
      await saveToKv(pruned, getNextOrderNumber(next));
    }
    return { ok: true };
  } catch {
    const before = memoryOrders.length;
    memoryOrders = pruneOrders(memoryOrders.filter((o) => o.id !== id));
    if (memoryOrders.length === before) return { ok: false, error: "not_found" };
    if (isKvEnabled()) {
      await saveToKv(memoryOrders, getNextOrderNumber(memoryOrders));
    }
    return { ok: true };
  }
}
