import { redis, isRedisConfigured } from "@/lib/redis";
import { findOrderByOrderNumber } from "@/lib/ordersStore";

const META_KEY = "bh:ratings:meta";
const ORDER_KEY_PREFIX = "bh:rating:order:";
const MAX_COMMENT_LEN = 400;

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
  } catch {
    return null;
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
  const row = {
    orderNumber,
    stars,
    comment,
    source,
    createdAt: new Date().toISOString(),
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
    const summary = await getRatingsSummary();
    return { ok: true, rating: row, summary };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}
