import { promises as fs } from "fs";
import path from "path";
import { kvGetJson, kvSetJson } from "@/lib/kvStore";
import { DELIVERY_VILLAGES } from "@/utils/deliveryPricing";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "delivery-fees.json");
const KV_KEY = "burgerhut:delivery-fees";

/** @type {{ fees: Record<string, number>, updatedAt: number } | null} */
let memoryFees = null;

const MAX_FEE = 500;

export function defaultDeliveryFees() {
  return Object.fromEntries(
    DELIVERY_VILLAGES.map((v) => [v.id, Math.round(Number(v.fee) || 0)])
  );
}

export function normalizeVillageFee(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_FEE) return null;
  return Math.round(n);
}

function mergeFees(raw) {
  const defaults = defaultDeliveryFees();
  const src = raw && typeof raw === "object" ? raw : {};
  const fees = { ...defaults };
  for (const v of DELIVERY_VILLAGES) {
    const n = normalizeVillageFee(src[v.id]);
    if (n != null) fees[v.id] = n;
  }
  return fees;
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, fees: Record<string, number> } | { ok: false, error: string }}
 */
export function parseAndValidateDeliveryFees(body) {
  const incoming =
    body?.fees && typeof body.fees === "object" && !Array.isArray(body.fees)
      ? body.fees
      : body;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return { ok: false, error: "invalid_fees" };
  }
  const fees = { ...defaultDeliveryFees() };
  for (const v of DELIVERY_VILLAGES) {
    if (incoming[v.id] == null || incoming[v.id] === "") continue;
    const n = normalizeVillageFee(incoming[v.id]);
    if (n == null) return { ok: false, error: "invalid_fee" };
    fees[v.id] = n;
  }
  return { ok: true, fees };
}

export function villagesWithFees(feesById) {
  const fees = mergeFees(feesById);
  return DELIVERY_VILLAGES.map((v) => ({
    id: v.id,
    labelHe: v.labelHe,
    labelAr: v.labelAr,
    fee: fees[v.id],
    defaultFee: Math.round(Number(v.fee) || 0),
  }));
}

export async function getDeliveryVillageFees() {
  const fromKv = await kvGetJson(KV_KEY);
  if (fromKv && typeof fromKv === "object") {
    return mergeFees(fromKv.fees || fromKv);
  }
  if (memoryFees?.fees) return mergeFees(memoryFees.fees);
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return mergeFees(parsed?.fees || parsed);
  } catch {
    return defaultDeliveryFees();
  }
}

/**
 * @param {Record<string, number>} fees
 */
export async function setDeliveryVillageFees(fees) {
  const next = {
    fees: mergeFees(fees),
    updatedAt: Date.now(),
  };
  const savedToKv = await kvSetJson(KV_KEY, next);
  if (savedToKv) {
    memoryFees = null;
    return next.fees;
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
    memoryFees = null;
  } catch {
    memoryFees = next;
  }
  return next.fees;
}
