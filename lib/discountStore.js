import { promises as fs } from "fs";
import path from "path";
import { kvGetJson, kvSetJson } from "@/lib/kvStore";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "discount.json");
const KV_KEY = "burgerhut:discount";

/** @type {{ enabled: boolean, percent: number, minOrderTotal: number, reason: string, couponEnabled: boolean, couponPercent: number, updatedAt: number } | null} */
let memoryDiscount = null;

function normalizePercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

function normalizeMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return Math.round(n * 100) / 100;
}

function normalizedDefault() {
  return {
    enabled: false,
    percent: 0,
    minOrderTotal: 0,
    reason: "",
    couponEnabled: false,
    couponPercent: 0,
    updatedAt: 0,
  };
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: { enabled: boolean, percent: number, minOrderTotal: number, reason: string, couponEnabled: boolean, couponPercent: number } } | { ok: false, error: string }}
 */
export function parseAndValidateDiscount(body) {
  const enabled = Boolean(body?.enabled);
  const percent = normalizePercent(body?.percent);
  const minOrderTotal = normalizeMoney(body?.minOrderTotal);
  const reason = String(body?.reason ?? "").trim().slice(0, 180);
  const couponEnabled = Boolean(body?.couponEnabled);
  const couponPercent = normalizePercent(
    body?.couponPercent == null ? 0 : body?.couponPercent
  );
  if (percent == null) return { ok: false, error: "invalid_percent" };
  if (minOrderTotal == null) return { ok: false, error: "invalid_min_total" };
  if (couponPercent == null) return { ok: false, error: "invalid_coupon_percent" };
  return {
    ok: true,
    value: {
      enabled,
      percent,
      minOrderTotal,
      reason,
      couponEnabled,
      couponPercent,
    },
  };
}

/**
 * @returns {Promise<{ enabled: boolean, percent: number, minOrderTotal: number, reason: string, couponEnabled: boolean, couponPercent: number, updatedAt: number }>}
 */
export async function getDiscountConfig() {
  const fromKv = await kvGetJson(KV_KEY);
  if (fromKv && typeof fromKv === "object") {
    const percent = normalizePercent(fromKv.percent);
    const minOrderTotal = normalizeMoney(fromKv.minOrderTotal);
    return {
      enabled: Boolean(fromKv.enabled),
      percent: percent ?? 0,
      minOrderTotal: minOrderTotal ?? 0,
      reason: String(fromKv.reason ?? "").trim().slice(0, 180),
      couponEnabled: Boolean(fromKv.couponEnabled),
      couponPercent: normalizePercent(fromKv.couponPercent) ?? 0,
      updatedAt: Number(fromKv.updatedAt) || 0,
    };
  }
  if (memoryDiscount) return { ...memoryDiscount };
  const def = normalizedDefault();
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    const percent = normalizePercent(parsed?.percent);
    const minOrderTotal = normalizeMoney(parsed?.minOrderTotal);
    return {
      enabled: Boolean(parsed?.enabled),
      percent: percent ?? 0,
      minOrderTotal: minOrderTotal ?? 0,
      reason: String(parsed?.reason ?? "").trim().slice(0, 180),
      couponEnabled: Boolean(parsed?.couponEnabled),
      couponPercent: normalizePercent(parsed?.couponPercent) ?? 0,
      updatedAt: Number(parsed?.updatedAt) || 0,
    };
  } catch {
    return def;
  }
}

/**
 * @param {{ enabled: boolean, percent: number, minOrderTotal: number, reason?: string, couponEnabled?: boolean, couponPercent?: number }} cfg
 */
export async function setDiscountConfig(cfg) {
  const next = {
    enabled: Boolean(cfg.enabled),
    percent: normalizePercent(cfg.percent) ?? 0,
    minOrderTotal: normalizeMoney(cfg.minOrderTotal) ?? 0,
    reason: String(cfg.reason ?? "").trim().slice(0, 180),
    couponEnabled: Boolean(cfg.couponEnabled),
    couponPercent: normalizePercent(cfg.couponPercent) ?? 0,
    updatedAt: Date.now(),
  };
  const savedToKv = await kvSetJson(KV_KEY, next);
  if (savedToKv) {
    memoryDiscount = null;
    return next;
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
    memoryDiscount = null;
  } catch {
    memoryDiscount = next;
  }
  return next;
}
