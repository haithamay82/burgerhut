/**
 * מחיקת הזמנות מ-Upstash / Vercel KV (מפתח burgerhut:orders).
 *
 * דרישות: קובץ .env.local (או משתני סביבה) עם אחת מהקבוצות:
 *   KV_REST_API_URL + KV_REST_API_TOKEN
 *   או UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *
 * שימוש:
 *   node scripts/kv-prune-orders.js --dry-run --april-2026
 *   node scripts/kv-prune-orders.js --april-2026
 *   node scripts/kv-prune-orders.js --all   (דורש CONFIRM_DELETE_ALL_ORDERS=YES)
 */
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const KV_KEY = "burgerhut:orders";
const FIRST_ORDER_NUMBER = 5000;

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  for (const line of text.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function kvRestBase() {
  const u =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    "";
  return String(u).replace(/\/+$/, "");
}

function kvRestToken() {
  return (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ""
  );
}

async function restGet(key) {
  const base = kvRestBase();
  const token = kvRestToken();
  if (!base || !token) throw new Error("Missing KV_REST_* or UPSTASH_REDIS_* env");
  const url = `${base}/get/${encodeURIComponent(key)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`GET failed: ${r.status}`);
  const j = await r.json().catch(() => ({}));
  return j?.result ?? null;
}

async function restSet(key, value) {
  const base = kvRestBase();
  const token = kvRestToken();
  const url = `${base}/set/${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`SET failed: ${r.status}`);
  return true;
}

function parseMaybeJson(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (typeof v === "object") return v;
  return null;
}

function parseKvPayload(raw) {
  const parsed = parseMaybeJson(raw);
  if (Array.isArray(parsed)) {
    return { orders: parsed, nextOrderNumber: null };
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.orders)) {
    return {
      orders: parsed.orders,
      nextOrderNumber: Number(parsed.nextOrderNumber) || null,
    };
  }
  return { orders: null, nextOrderNumber: null };
}

function getNextOrderNumber(orders) {
  if (!Array.isArray(orders) || !orders.length) return FIRST_ORDER_NUMBER;
  let maxOrderNumber = FIRST_ORDER_NUMBER - 1;
  for (const order of orders) {
    const n = Number(order?.orderNumber);
    if (Number.isFinite(n) && n > maxOrderNumber) maxOrderNumber = n;
  }
  return Math.max(FIRST_ORDER_NUMBER, maxOrderNumber + 1);
}

/** אפריל 2026 לפי לוח שנה בישראל (Asia/Jerusalem) */
function inApril2026Israel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return y === "2026" && m === "04";
}

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes("--dry-run"),
    april2026: argv.includes("--april-2026"),
    all: argv.includes("--all"),
  };
}

async function main() {
  loadEnvLocal();
  const { dryRun, april2026, all } = parseArgs();

  if (!april2026 && !all) {
    console.error(
      "Specify --april-2026 (remove April 2026 orders, Israel TZ) or --all (wipe all orders)."
    );
    process.exit(1);
  }

  if (all && process.env.CONFIRM_DELETE_ALL_ORDERS !== "YES") {
    console.error(
      "Refusing --all without CONFIRM_DELETE_ALL_ORDERS=YES in the environment."
    );
    process.exit(1);
  }

  const raw = await restGet(KV_KEY);
  const { orders: existing, nextOrderNumber: storedNext } = parseKvPayload(raw);

  if (!Array.isArray(existing)) {
    console.error(
      "No orders array in KV (empty key or unexpected shape). Key:",
      KV_KEY
    );
    process.exit(1);
  }

  let remaining;
  let label;
  if (all) {
    remaining = [];
    label = "ALL orders";
  } else {
    remaining = existing.filter((o) => !inApril2026Israel(o?.createdAt));
    label = "April 2026 (Asia/Jerusalem) orders";
  }

  const removed = existing.length - remaining.length;
  const nextCounter = Math.max(
    Number(storedNext) || FIRST_ORDER_NUMBER,
    getNextOrderNumber(remaining)
  );
  const payload = {
    orders: remaining,
    nextOrderNumber: nextCounter,
    updatedAt: Date.now(),
  };

  console.log("KV key:", KV_KEY);
  console.log("Mode:", label);
  console.log("Before count:", existing.length);
  console.log("Remove count:", removed);
  console.log("After count:", remaining.length);
  console.log("nextOrderNumber (stored):", storedNext, "→", nextCounter);

  if (dryRun) {
    console.log("\n--dry-run: no write performed.");
    return;
  }

  if (removed === 0) {
    console.log("Nothing to remove; skipping SET.");
    return;
  }

  await restSet(KV_KEY, payload);
  console.log("KV updated successfully.");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
