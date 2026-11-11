import { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";
import { isKvEnabled, kvGetJson, kvSetJson } from "@/lib/kvStore";
import {
  canCustomerCancelOrder,
  defaultFulfillmentForNewOrder,
  normalizePrepMinutes,
  readStoredFulfillment,
  resolveFulfillment,
} from "@/utils/orderFulfillment";

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
  if (!Number.isFinite(n) || n <= 0) return 35;
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

/** הזמנה עם deferAdminPush (מצב ישן) שעדיין לא אושרה — לא מוצגת למנהל */
export function isOrderHeldForCustomerWhatsApp(order) {
  const m = order?.meta;
  if (!m || typeof m !== "object") return false;
  if (!m.adminPushDeferred) return false;
  return !m.adminPushNotified;
}

export async function listOrdersForAdmin() {
  const all = await listOrders();
  return all.filter((o) => !isOrderHeldForCustomerWhatsApp(o));
}

export async function findOrderById(orderId) {
  const want = String(orderId ?? "").trim();
  if (!want) return null;
  const orders = await listOrders();
  return orders.find((o) => o && String(o.id) === want) ?? null;
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
/**
 * @param {string|number} orderNumber
 * @returns {Promise<object | null>}
 */
export async function findOrderByOrderNumber(orderNumber) {
  const n = Number(orderNumber);
  if (!Number.isFinite(n)) return null;
  const orders = await listOrders();
  return orders.find((o) => Number(o?.orderNumber) === n) ?? null;
}

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
      fulfillment: defaultFulfillmentForNewOrder(),
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
      fulfillment: defaultFulfillmentForNewOrder(),
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
      fulfillment: defaultFulfillmentForNewOrder(),
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
/**
 * אחרי שליחת ווטסאפ — אימות סוד חד-פעמי, סימון ההזמנה כמודיעה למנהלים, והחזרה ל-broadcast.
 * @param {string} orderId
 * @param {string|number} orderNumber
 * @param {string} confirmSecret
 * @returns {Promise<{ ok: true, already: boolean, orderNumber: number } | { ok: false, error: string }>}
 */
export async function completeDeferredAdminPush(orderId, orderNumber, confirmSecret) {
  const id = String(orderId || "").trim();
  const on = Number(orderNumber);
  const secret = String(confirmSecret || "").trim();
  if (!id || !Number.isFinite(on) || !secret) {
    return { ok: false, error: "invalid_params" };
  }
  const wantHash = crypto.createHash("sha256").update(secret).digest("hex");

  const tryPatch = (order) => {
    if (!order || order.id !== id || Number(order.orderNumber) !== on) return null;
    const meta =
      order.meta && typeof order.meta === "object" && !Array.isArray(order.meta)
        ? { ...order.meta }
        : {};
    if (meta.adminPushNotified) {
      return { order: { ...order, meta }, already: true };
    }
    if (!meta.adminPushDeferred || meta.adminPushSecretHash !== wantHash) {
      return null;
    }
    const nextMeta = { ...meta };
    delete nextMeta.adminPushDeferred;
    delete nextMeta.adminPushSecretHash;
    nextMeta.adminPushNotified = true;
    nextMeta.adminPushNotifiedAt = new Date().toISOString();
    return { order: { ...order, meta: nextMeta }, already: false };
  };

  const fromKv = await loadFromKv();
  if (Array.isArray(fromKv.orders)) {
    const idx = fromKv.orders.findIndex(
      (o) => o && o.id === id && Number(o?.orderNumber) === on
    );
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = tryPatch(fromKv.orders[idx]);
    if (!patched) return { ok: false, error: "unauthorized" };
    if (patched.already) {
      return { ok: true, already: true, orderNumber: on };
    }
    const next = [...fromKv.orders];
    next[idx] = patched.order;
    const nextCounter = Math.max(
      Number(fromKv.nextOrderNumber) || FIRST_ORDER_NUMBER,
      getNextOrderNumber(next)
    );
    const saved = await saveToKv(pruneOrders(next), nextCounter);
    if (saved) return { ok: true, already: false, orderNumber: on };
  }

  try {
    await ensureDataFile();
    const all = normalizeOrders(
      JSON.parse(await fs.readFile(ORDERS_FILE, "utf8") || "[]")
    );
    if (!Array.isArray(all)) throw new Error("invalid store");
    const idx = all.findIndex(
      (o) => o && o.id === id && Number(o?.orderNumber) === on
    );
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = tryPatch(all[idx]);
    if (!patched) return { ok: false, error: "unauthorized" };
    if (patched.already) {
      return { ok: true, already: true, orderNumber: on };
    }
    const next = [...all];
    next[idx] = patched.order;
    const pruned = pruneOrders(next);
    await fs.writeFile(ORDERS_FILE, JSON.stringify(pruned, null, 2), "utf8");
    if (isKvEnabled()) {
      await saveToKv(pruned, getNextOrderNumber(next));
    }
    return { ok: true, already: false, orderNumber: on };
  } catch {
    const base = pruneOrders(memoryOrders);
    const idx = base.findIndex(
      (o) => o && o.id === id && Number(o?.orderNumber) === on
    );
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = tryPatch(base[idx]);
    if (!patched) return { ok: false, error: "unauthorized" };
    if (patched.already) {
      return { ok: true, already: true, orderNumber: on };
    }
    const next = [...base];
    next[idx] = patched.order;
    memoryOrders = pruneOrders(next);
    if (isKvEnabled()) {
      await saveToKv(memoryOrders, getNextOrderNumber(memoryOrders));
    }
    return { ok: true, already: false, orderNumber: on };
  }
}

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

function withResolvedFulfillment(order) {
  if (!order) return order;
  const resolved = resolveFulfillment(order);
  const stored = readStoredFulfillment(order);
  if (
    stored.status === resolved.status &&
    stored.readyAt === resolved.readyAt
  ) {
    return { ...order, fulfillment: stored };
  }
  return { ...order, fulfillment: resolved };
}

/**
 * Persist preparing→ready when timer elapsed.
 * @param {object} order
 */
function applyAutoReadyIfNeeded(order) {
  const stored = readStoredFulfillment(order);
  const resolved = resolveFulfillment(order);
  if (stored.status === "preparing" && resolved.status === "ready") {
    const meta =
      order?.meta && typeof order.meta === "object" && !Array.isArray(order.meta)
        ? { ...order.meta }
        : {};
    const shouldNotify = !meta.customerReadyPushSent;
    if (shouldNotify) {
      meta.customerReadyPushSent = true;
    }
    return {
      order: { ...order, fulfillment: resolved, meta },
      changed: true,
      notifyEvent: shouldNotify ? "ready" : null,
    };
  }
  return {
    order: { ...order, fulfillment: stored },
    changed: false,
    notifyEvent: null,
  };
}

/**
 * @param {string} id
 * @param {{
 *   action: "accept"|"reject"|"deliver"|"extend"|"mark_ready",
 *   prepMinutes?: number,
 * }} input
 */
export async function updateOrderFulfillmentById(id, input) {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "invalid_id" };
  }
  const action = String(input?.action || "").trim();
  if (
    !["accept", "reject", "deliver", "extend", "mark_ready"].includes(action)
  ) {
    return { ok: false, error: "invalid_action" };
  }

  const apply = (order) => {
    if (!order) return { ok: false, error: "not_found" };
    const auto = applyAutoReadyIfNeeded(order);
    let current = auto.order;
    let f = { ...readStoredFulfillment(current) };
    f = { ...resolveFulfillment({ ...current, fulfillment: f }) };
    const nowIso = new Date().toISOString();
    const meta =
      current.meta && typeof current.meta === "object" && !Array.isArray(current.meta)
        ? { ...current.meta }
        : {};
    /** @type {"accepted"|"rejected"|"ready"|null} */
    let notifyEvent = auto.notifyEvent || null;

    if (action === "accept") {
      if (f.status !== "pending") {
        return { ok: false, error: "invalid_state" };
      }
      const mins = normalizePrepMinutes(input?.prepMinutes);
      if (mins == null) return { ok: false, error: "invalid_prep_minutes" };
      const ends = new Date(Date.now() + mins * 60 * 1000).toISOString();
      f = {
        ...f,
        status: "preparing",
        prepMinutes: mins,
        prepEndsAt: ends,
        acceptedAt: nowIso,
        rejectedAt: null,
        readyAt: null,
        deliveredAt: null,
      };
      notifyEvent = "accepted";
    } else if (action === "reject") {
      if (f.status !== "pending") {
        return { ok: false, error: "invalid_state" };
      }
      f = {
        ...f,
        status: "rejected",
        prepMinutes: null,
        prepEndsAt: null,
        rejectedAt: nowIso,
        acceptedAt: null,
        readyAt: null,
        deliveredAt: null,
      };
      notifyEvent = "rejected";
    } else if (action === "extend") {
      if (f.status !== "preparing") {
        return { ok: false, error: "invalid_state" };
      }
      const mins = normalizePrepMinutes(input?.prepMinutes);
      if (mins == null) return { ok: false, error: "invalid_prep_minutes" };
      const baseEnds = new Date(f.prepEndsAt || Date.now()).getTime();
      const from = Number.isFinite(baseEnds) ? Math.max(baseEnds, Date.now()) : Date.now();
      const ends = new Date(from + mins * 60 * 1000).toISOString();
      const prevMins = Number(f.prepMinutes) || 0;
      f = {
        ...f,
        status: "preparing",
        prepMinutes: prevMins + mins,
        prepEndsAt: ends,
      };
    } else if (action === "mark_ready") {
      if (f.status !== "preparing" && f.status !== "ready") {
        return { ok: false, error: "invalid_state" };
      }
      if (f.status === "ready") {
        return {
          ok: true,
          already: true,
          notifyEvent: null,
          order: { ...current, fulfillment: f, meta },
        };
      }
      f = {
        ...f,
        status: "ready",
        readyAt: nowIso,
        prepEndsAt: nowIso,
      };
      if (!meta.customerReadyPushSent) {
        meta.customerReadyPushSent = true;
        notifyEvent = "ready";
      }
    } else if (action === "deliver") {
      if (f.status !== "ready") {
        return { ok: false, error: "invalid_state" };
      }
      f = {
        ...f,
        status: "delivered",
        deliveredAt: nowIso,
      };
      meta.adminDone = true;
      meta.adminDoneAt = nowIso;
      notifyEvent = "delivered";
    }

    return {
      ok: true,
      already: false,
      notifyEvent,
      order: { ...current, fulfillment: f, meta },
    };
  };

  const fromKv = await loadFromKv();
  if (Array.isArray(fromKv.orders)) {
    const idx = fromKv.orders.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = apply(fromKv.orders[idx]);
    if (!patched.ok) return patched;
    if (patched.already) {
      return {
        ok: true,
        already: true,
        notifyEvent: patched.notifyEvent || null,
        order: patched.order,
      };
    }
    const next = [...fromKv.orders];
    next[idx] = patched.order;
    const nextCounter = Math.max(
      Number(fromKv.nextOrderNumber) || FIRST_ORDER_NUMBER,
      getNextOrderNumber(next)
    );
    const saved = await saveToKv(pruneOrders(next), nextCounter);
    if (saved) {
      return {
        ok: true,
        already: false,
        notifyEvent: patched.notifyEvent || null,
        order: patched.order,
      };
    }
  }

  try {
    await ensureDataFile();
    const all = normalizeOrders(
      JSON.parse((await fs.readFile(ORDERS_FILE, "utf8")) || "[]")
    );
    if (!Array.isArray(all)) throw new Error("invalid store");
    const idx = all.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = apply(all[idx]);
    if (!patched.ok) return patched;
    if (patched.already) {
      return {
        ok: true,
        already: true,
        notifyEvent: patched.notifyEvent || null,
        order: patched.order,
      };
    }
    const next = [...all];
    next[idx] = patched.order;
    const pruned = pruneOrders(next);
    await fs.writeFile(ORDERS_FILE, JSON.stringify(pruned, null, 2), "utf8");
    if (isKvEnabled()) {
      await saveToKv(pruned, getNextOrderNumber(next));
    }
    return {
      ok: true,
      already: false,
      notifyEvent: patched.notifyEvent || null,
      order: patched.order,
    };
  } catch {
    const idx = memoryOrders.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = apply(memoryOrders[idx]);
    if (!patched.ok) return patched;
    if (patched.already) {
      return {
        ok: true,
        already: true,
        notifyEvent: patched.notifyEvent || null,
        order: patched.order,
      };
    }
    const next = [...memoryOrders];
    next[idx] = patched.order;
    memoryOrders = pruneOrders(next);
    if (isKvEnabled()) {
      await saveToKv(memoryOrders, getNextOrderNumber(memoryOrders));
    }
    return {
      ok: true,
      already: false,
      notifyEvent: patched.notifyEvent || null,
      order: patched.order,
    };
  }
}

/**
 * קישור מזהה Push של לקוח להזמנה (להתראות סטטוס).
 * @param {string|number} orderNumber
 * @param {string} pushClientId
 */
export async function bindCustomerPushClientToOrder(orderNumber, pushClientId) {
  const on = Number(orderNumber);
  const id = String(pushClientId || "").trim();
  if (!Number.isFinite(on) || !id) {
    return { ok: false, error: "invalid_params" };
  }

  const apply = (order) => {
    if (!order || Number(order.orderNumber) !== on) return null;
    const meta =
      order.meta && typeof order.meta === "object" && !Array.isArray(order.meta)
        ? { ...order.meta }
        : {};
    if (String(meta.customerPushClientId || "").trim() === id) {
      return { order: { ...order, meta }, already: true };
    }
    return {
      order: {
        ...order,
        meta: { ...meta, customerPushClientId: id },
      },
      already: false,
    };
  };

  const fromKv = await loadFromKv();
  if (Array.isArray(fromKv.orders)) {
    const idx = fromKv.orders.findIndex(
      (o) => o && Number(o.orderNumber) === on
    );
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = apply(fromKv.orders[idx]);
    if (!patched) return { ok: false, error: "not_found" };
    if (patched.already) return { ok: true, already: true, order: patched.order };
    const next = [...fromKv.orders];
    next[idx] = patched.order;
    const nextCounter = Math.max(
      Number(fromKv.nextOrderNumber) || FIRST_ORDER_NUMBER,
      getNextOrderNumber(next)
    );
    const saved = await saveToKv(pruneOrders(next), nextCounter);
    if (saved) return { ok: true, already: false, order: patched.order };
  }

  try {
    await ensureDataFile();
    const all = normalizeOrders(
      JSON.parse((await fs.readFile(ORDERS_FILE, "utf8")) || "[]")
    );
    if (!Array.isArray(all)) throw new Error("invalid store");
    const idx = all.findIndex((o) => o && Number(o.orderNumber) === on);
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = apply(all[idx]);
    if (!patched) return { ok: false, error: "not_found" };
    if (patched.already) return { ok: true, already: true, order: patched.order };
    const next = [...all];
    next[idx] = patched.order;
    const pruned = pruneOrders(next);
    await fs.writeFile(ORDERS_FILE, JSON.stringify(pruned, null, 2), "utf8");
    if (isKvEnabled()) {
      await saveToKv(pruned, getNextOrderNumber(next));
    }
    return { ok: true, already: false, order: patched.order };
  } catch {
    const idx = memoryOrders.findIndex((o) => o && Number(o.orderNumber) === on);
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = apply(memoryOrders[idx]);
    if (!patched) return { ok: false, error: "not_found" };
    if (patched.already) return { ok: true, already: true, order: patched.order };
    const next = [...memoryOrders];
    next[idx] = patched.order;
    memoryOrders = pruneOrders(next);
    if (isKvEnabled()) {
      await saveToKv(memoryOrders, getNextOrderNumber(memoryOrders));
    }
    return { ok: true, already: false, order: patched.order };
  }
}

/**
 * ביטול הזמנת מזומן ע״י הלקוח תוך חלון הזמן ובסטטוס ממתינה.
 * @param {{ orderId: string, cancelSecret: string }} input
 */
export async function cancelOrderByCustomer(input) {
  const id = String(input?.orderId || "").trim();
  const secret = String(input?.cancelSecret || "").trim();
  if (!id || !secret) return { ok: false, error: "invalid_params" };
  const wantHash = crypto.createHash("sha256").update(secret).digest("hex");

  const apply = (order) => {
    if (!order || String(order.id) !== id) return { ok: false, error: "not_found" };
    const payment = String(order.payment || "cash").trim().toLowerCase();
    if (payment !== "cash") return { ok: false, error: "not_cash" };
    const meta =
      order.meta && typeof order.meta === "object" && !Array.isArray(order.meta)
        ? { ...order.meta }
        : {};
    const hash = String(meta.customerCancelSecretHash || "").trim();
    if (!hash || hash !== wantHash) return { ok: false, error: "unauthorized" };
    if (!canCustomerCancelOrder(order)) {
      return { ok: false, error: "cancel_window_closed" };
    }
    const nowIso = new Date().toISOString();
    const f = {
      ...readStoredFulfillment(order),
      status: "cancelled",
      prepMinutes: null,
      prepEndsAt: null,
      rejectedAt: null,
      acceptedAt: null,
      readyAt: null,
      deliveredAt: null,
    };
    return {
      ok: true,
      order: {
        ...order,
        fulfillment: f,
        meta: {
          ...meta,
          cancelledByCustomer: true,
          cancelledByCustomerAt: nowIso,
        },
      },
    };
  };

  const fromKv = await loadFromKv();
  if (Array.isArray(fromKv.orders)) {
    const idx = fromKv.orders.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = apply(fromKv.orders[idx]);
    if (!patched.ok) return patched;
    const next = [...fromKv.orders];
    next[idx] = patched.order;
    const nextCounter = Math.max(
      Number(fromKv.nextOrderNumber) || FIRST_ORDER_NUMBER,
      getNextOrderNumber(next)
    );
    const saved = await saveToKv(pruneOrders(next), nextCounter);
    if (saved) return { ok: true, order: patched.order };
  }

  try {
    await ensureDataFile();
    const all = normalizeOrders(
      JSON.parse((await fs.readFile(ORDERS_FILE, "utf8")) || "[]")
    );
    if (!Array.isArray(all)) throw new Error("invalid store");
    const idx = all.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = apply(all[idx]);
    if (!patched.ok) return patched;
    const next = [...all];
    next[idx] = patched.order;
    const pruned = pruneOrders(next);
    await fs.writeFile(ORDERS_FILE, JSON.stringify(pruned, null, 2), "utf8");
    if (isKvEnabled()) {
      await saveToKv(pruned, getNextOrderNumber(next));
    }
    return { ok: true, order: patched.order };
  } catch {
    const idx = memoryOrders.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = apply(memoryOrders[idx]);
    if (!patched.ok) return patched;
    const next = [...memoryOrders];
    next[idx] = patched.order;
    memoryOrders = pruneOrders(next);
    if (isKvEnabled()) {
      await saveToKv(memoryOrders, getNextOrderNumber(memoryOrders));
    }
    return { ok: true, order: patched.order };
  }
}

/** Persist auto-ready for one order (customer poll / admin refresh). */
export async function syncOrderFulfillmentById(id) {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "invalid_id" };
  }
  const apply = (order) => {
    const r = applyAutoReadyIfNeeded(order);
    return r;
  };

  const fromKv = await loadFromKv();
  if (Array.isArray(fromKv.orders)) {
    const idx = fromKv.orders.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const r = apply(fromKv.orders[idx]);
    if (!r.changed) {
      return {
        ok: true,
        changed: false,
        notifyEvent: null,
        order: withResolvedFulfillment(r.order),
      };
    }
    const next = [...fromKv.orders];
    next[idx] = r.order;
    const nextCounter = Math.max(
      Number(fromKv.nextOrderNumber) || FIRST_ORDER_NUMBER,
      getNextOrderNumber(next)
    );
    const saved = await saveToKv(pruneOrders(next), nextCounter);
    if (saved) {
      return {
        ok: true,
        changed: true,
        notifyEvent: r.notifyEvent || null,
        order: r.order,
      };
    }
  }

  try {
    await ensureDataFile();
    const all = normalizeOrders(
      JSON.parse((await fs.readFile(ORDERS_FILE, "utf8")) || "[]")
    );
    if (!Array.isArray(all)) throw new Error("invalid store");
    const idx = all.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const r = apply(all[idx]);
    if (!r.changed) {
      return {
        ok: true,
        changed: false,
        notifyEvent: null,
        order: withResolvedFulfillment(r.order),
      };
    }
    const next = [...all];
    next[idx] = r.order;
    const pruned = pruneOrders(next);
    await fs.writeFile(ORDERS_FILE, JSON.stringify(pruned, null, 2), "utf8");
    if (isKvEnabled()) {
      await saveToKv(pruned, getNextOrderNumber(next));
    }
    return {
      ok: true,
      changed: true,
      notifyEvent: r.notifyEvent || null,
      order: r.order,
    };
  } catch {
    const idx = memoryOrders.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const r = apply(memoryOrders[idx]);
    if (!r.changed) {
      return {
        ok: true,
        changed: false,
        notifyEvent: null,
        order: withResolvedFulfillment(r.order),
      };
    }
    const next = [...memoryOrders];
    next[idx] = r.order;
    memoryOrders = pruneOrders(next);
    if (isKvEnabled()) {
      await saveToKv(memoryOrders, getNextOrderNumber(memoryOrders));
    }
    return {
      ok: true,
      changed: true,
      notifyEvent: r.notifyEvent || null,
      order: r.order,
    };
  }
}

export async function markOrderDoneById(id) {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "invalid_id" };
  }

  const applyDone = (order) => {
    const auto = applyAutoReadyIfNeeded(order);
    const current = auto.order;
    const f = resolveFulfillment(current);
    const meta =
      current?.meta && typeof current.meta === "object" && !Array.isArray(current.meta)
        ? { ...current.meta }
        : {};
    if (meta.adminDoneAt || meta.adminDone || f.status === "delivered") {
      return {
        order: {
          ...current,
          fulfillment: { ...f, status: "delivered" },
          meta,
        },
        already: true,
      };
    }
    if (f.status !== "ready" && f.status !== "delivered") {
      return { order: null, error: "invalid_state" };
    }
    const nowIso = new Date().toISOString();
    const nextMeta = {
      ...meta,
      adminDone: true,
      adminDoneAt: nowIso,
    };
    return {
      order: {
        ...current,
        fulfillment: {
          ...f,
          status: "delivered",
          deliveredAt: nowIso,
        },
        meta: nextMeta,
      },
      already: false,
    };
  };

  const fromKv = await loadFromKv();
  if (Array.isArray(fromKv.orders)) {
    const idx = fromKv.orders.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = applyDone(fromKv.orders[idx]);
    if (patched.error) return { ok: false, error: patched.error };
    const next = [...fromKv.orders];
    next[idx] = patched.order;
    const nextCounter = Math.max(
      Number(fromKv.nextOrderNumber) || FIRST_ORDER_NUMBER,
      getNextOrderNumber(next)
    );
    const saved = await saveToKv(pruneOrders(next), nextCounter);
    if (saved) return { ok: true, already: patched.already, order: patched.order };
  }

  try {
    await ensureDataFile();
    const all = normalizeOrders(JSON.parse((await fs.readFile(ORDERS_FILE, "utf8")) || "[]"));
    if (!Array.isArray(all)) throw new Error("invalid store");
    const idx = all.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = applyDone(all[idx]);
    if (patched.error) return { ok: false, error: patched.error };
    const next = [...all];
    next[idx] = patched.order;
    const pruned = pruneOrders(next);
    await fs.writeFile(ORDERS_FILE, JSON.stringify(pruned, null, 2), "utf8");
    if (isKvEnabled()) {
      await saveToKv(pruned, getNextOrderNumber(next));
    }
    return { ok: true, already: patched.already, order: patched.order };
  } catch {
    const idx = memoryOrders.findIndex((o) => o && o.id === id);
    if (idx < 0) return { ok: false, error: "not_found" };
    const patched = applyDone(memoryOrders[idx]);
    if (patched.error) return { ok: false, error: patched.error };
    const next = [...memoryOrders];
    next[idx] = patched.order;
    memoryOrders = pruneOrders(next);
    if (isKvEnabled()) {
      await saveToKv(memoryOrders, getNextOrderNumber(memoryOrders));
    }
    return { ok: true, already: patched.already, order: patched.order };
  }
}

/** Attach resolved fulfillment for admin/employee list responses. */
export function decorateOrderFulfillment(order) {
  return withResolvedFulfillment(order);
}
