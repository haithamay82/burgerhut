import { redis, isRedisConfigured } from "@/lib/redis";
import { findOrderByOrderNumber } from "@/lib/ordersStore";

const META_KEY = "bh:ratings:meta";
const ORDER_KEY_PREFIX = "bh:rating:order:";
const RECENT_ZSET_KEY = "bh:ratings:recent";
const MAX_COMMENT_LEN = 400;
const MAX_PUBLIC_LIST = 100;

function orderKey(orderNumber) {
  return `${ORDER_KEY_PREFIX}${String(orderNumber)}`;
}

function normalizeStars(stars) {
  const n = Math.round(Number(stars));
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

function normalizeComment(comment) {
  const s = String(comment ?? "").trim();
  if (!s) return "";
  return s.slice(0, MAX_COMMENT_LEN);
}

function parseRatingRaw(raw) {
  if (!raw) return null;
  if (typeof raw === "object" && raw !== null) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function customerNameFromOrder(order) {
  return String(order?.customer?.name ?? "").trim();
}

async function indexRating(orderNumber, createdAt) {
  const ts = new Date(createdAt).getTime();
  const score = Number.isFinite(ts) ? ts : Date.now();
  await redis.zadd(RECENT_ZSET_KEY, {
    score,
    member: String(orderNumber),
  });
}

async function backfillRatingsIndexIfNeeded() {
  const meta = await getRatingsSummary();
  if (meta.count <= 0) return;
  const zcount = await redis.zcard(RECENT_ZSET_KEY);
  if (zcount >= meta.count) return;

  const keys = await redis.keys(`${ORDER_KEY_PREFIX}*`);
  for (const key of keys) {
    const raw = await redis.get(key);
    const row = parseRatingRaw(raw);
    if (!row?.orderNumber) continue;
    await indexRating(row.orderNumber, row.createdAt);
  }
}

/**
 * @returns {Promise<{ average: number, count: number, configured: boolean }>}
 */
export async function getRatingsSummary() {
  if (!isRedisConfigured() || !redis) {
    return { average: 0, count: 0, configured: false };
  }
  try {
    const meta = await redis.hgetall(META_KEY);
    const count = Number(meta?.count) || 0;
    const sum = Number(meta?.sum) || 0;
    const average =
      count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
    return { average, count, configured: true };
  } catch {
    return { average: 0, count: 0, configured: false };
  }
}

/**
 * @param {string|number} orderNumber
 * @returns {Promise<object | null>}
 */
export async function getRatingByOrderNumber(orderNumber) {
  if (!isRedisConfigured() || !redis) return null;
  const n = Number(orderNumber);
  if (!Number.isFinite(n)) return null;
  try {
    const raw = await redis.get(orderKey(n));
    return parseRatingRaw(raw);
  } catch {
    return null;
  }
}

/**
 * @param {{ limit?: number }} [opts]
 */
export async function listPublicRatings(opts = {}) {
  if (!isRedisConfigured() || !redis) {
    return { ratings: [], configured: false };
  }
  const limit = Math.min(
    MAX_PUBLIC_LIST,
    Math.max(1, Number(opts.limit) || 50)
  );
  try {
    await backfillRatingsIndexIfNeeded();
    const orderNumbers = await redis.zrange(RECENT_ZSET_KEY, 0, limit - 1, {
      rev: true,
    });
    const members = Array.isArray(orderNumbers) ? orderNumbers : [];
    const ratings = [];
    for (const on of members) {
      const rating = await getRatingByOrderNumber(on);
      if (!rating) continue;
      let name = String(rating.customerName ?? "").trim();
      if (!name) {
        const order = await findOrderByOrderNumber(on);
        name = customerNameFromOrder(order);
      }
      ratings.push({
        name,
        stars: Number(rating.stars) || 0,
        comment: String(rating.comment ?? "").trim(),
        createdAt: String(rating.createdAt ?? ""),
      });
    }
    return { ratings, configured: true };
  } catch {
    return { ratings: [], configured: false };
  }
}

/**
 * @param {{ orderNumber: string|number, stars: number, comment?: string, source?: string }} input
 */
export async function saveFoodRating(input) {
  if (!isRedisConfigured() || !redis) {
    return { ok: false, error: "redis_not_configured" };
  }

  const orderNumber = Number(input?.orderNumber);
  if (!Number.isFinite(orderNumber) || orderNumber <= 0) {
    return { ok: false, error: "invalid_order_number" };
  }

  const stars = normalizeStars(input?.stars);
  if (stars === null) {
    return { ok: false, error: "invalid_stars" };
  }

  const order = await findOrderByOrderNumber(orderNumber);
  if (!order) {
    return { ok: false, error: "order_not_found" };
  }

  const existing = await getRatingByOrderNumber(orderNumber);
  if (existing) {
    return { ok: false, error: "already_rated", rating: existing };
  }

  const comment = normalizeComment(input?.comment);
  const source =
    String(input?.source || "success").trim().slice(0, 32) || "success";
  const createdAt = new Date().toISOString();
  const customerName = customerNameFromOrder(order);
  const row = {
    orderNumber,
    stars,
    comment,
    source,
    customerName,
    createdAt,
  };

  const key = orderKey(orderNumber);
  try {
    const setOk = await redis.set(key, JSON.stringify(row), { nx: true });
    if (!setOk) {
      const again = await getRatingByOrderNumber(orderNumber);
      return { ok: false, error: "already_rated", rating: again };
    }
    await redis.hincrby(META_KEY, "count", 1);
    await redis.hincrby(META_KEY, "sum", stars);
    await indexRating(orderNumber, createdAt);
    const summary = await getRatingsSummary();
    return { ok: true, rating: row, summary };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}
