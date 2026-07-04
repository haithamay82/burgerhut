import { redis, isRedisConfigured } from "@/lib/redis";
import { findOrderByOrderNumber } from "@/lib/ordersStore";
import crypto from "crypto";

const META_KEY = "bh:ratings:meta";
const ORDER_KEY_PREFIX = "bh:rating:order:";
const GUEST_KEY_PREFIX = "bh:rating:guest:";
const RECENT_ZSET_KEY = "bh:ratings:recent";
const MAX_COMMENT_LEN = 400;
const MAX_NAME_LEN = 80;
const MAX_PUBLIC_LIST = 100;

function orderKey(orderNumber) {
  return `${ORDER_KEY_PREFIX}${String(orderNumber)}`;
}

function guestKey(id) {
  return `${GUEST_KEY_PREFIX}${String(id)}`;
}

function orderIndexMember(orderNumber) {
  return `o:${String(orderNumber)}`;
}

function guestIndexMember(id) {
  return `g:${String(id)}`;
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

function normalizeName(name) {
  const s = String(name ?? "").trim();
  if (!s) return "";
  return s.slice(0, MAX_NAME_LEN);
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

function newGuestRatingId() {
  return `gr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

async function indexRatingEntry(member, createdAt) {
  const ts = new Date(createdAt).getTime();
  const score = Number.isFinite(ts) ? ts : Date.now();
  await redis.zadd(RECENT_ZSET_KEY, {
    score,
    member: String(member),
  });
}

async function incrementRatingMeta(stars) {
  await redis.hincrby(META_KEY, "count", 1);
  await redis.hincrby(META_KEY, "sum", stars);
}

async function backfillRatingsIndexIfNeeded() {
  const meta = await getRatingsSummary();
  if (meta.count <= 0) return;
  const zcount = await redis.zcard(RECENT_ZSET_KEY);
  if (zcount >= meta.count) return;

  const orderKeys = await redis.keys(`${ORDER_KEY_PREFIX}*`);
  for (const key of orderKeys) {
    const raw = await redis.get(key);
    const row = parseRatingRaw(raw);
    if (!row?.orderNumber) continue;
    await indexRatingEntry(orderIndexMember(row.orderNumber), row.createdAt);
  }

  const guestKeys = await redis.keys(`${GUEST_KEY_PREFIX}*`);
  for (const key of guestKeys) {
    const raw = await redis.get(key);
    const row = parseRatingRaw(raw);
    if (!row?.id) continue;
    await indexRatingEntry(guestIndexMember(row.id), row.createdAt);
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

async function getGuestRatingById(id) {
  if (!isRedisConfigured() || !redis) return null;
  const gid = String(id ?? "").trim();
  if (!gid) return null;
  try {
    const raw = await redis.get(guestKey(gid));
    return parseRatingRaw(raw);
  } catch {
    return null;
  }
}

async function resolvePublicRating(member) {
  const m = String(member ?? "");
  if (m.startsWith("g:")) {
    const rating = await getGuestRatingById(m.slice(2));
    if (!rating) return null;
    return {
      name: String(rating.customerName ?? "").trim(),
      stars: Number(rating.stars) || 0,
      comment: String(rating.comment ?? "").trim(),
      createdAt: String(rating.createdAt ?? ""),
    };
  }

  const orderToken = m.startsWith("o:") ? m.slice(2) : m;
  const rating = await getRatingByOrderNumber(orderToken);
  if (!rating) return null;
  let name = String(rating.customerName ?? "").trim();
  if (!name) {
    const order = await findOrderByOrderNumber(orderToken);
    name = customerNameFromOrder(order);
  }
  return {
    name,
    stars: Number(rating.stars) || 0,
    comment: String(rating.comment ?? "").trim(),
    createdAt: String(rating.createdAt ?? ""),
  };
}

async function resolveAdminRating(member) {
  const m = String(member ?? "");
  if (m.startsWith("g:")) {
    const id = m.slice(2);
    const rating = await getGuestRatingById(id);
    if (!rating) return null;
    return {
      id: guestIndexMember(id),
      type: "guest",
      name: String(rating.customerName ?? "").trim(),
      stars: Number(rating.stars) || 0,
      comment: String(rating.comment ?? "").trim(),
      source: String(rating.source ?? ""),
      createdAt: String(rating.createdAt ?? ""),
    };
  }

  const orderToken = m.startsWith("o:") ? m.slice(2) : m;
  const rating = await getRatingByOrderNumber(orderToken);
  if (!rating) return null;
  let name = String(rating.customerName ?? "").trim();
  if (!name) {
    const order = await findOrderByOrderNumber(orderToken);
    name = customerNameFromOrder(order);
  }
  return {
    id: orderIndexMember(orderToken),
    type: "order",
    orderNumber: String(orderToken),
    name,
    stars: Number(rating.stars) || 0,
    comment: String(rating.comment ?? "").trim(),
    source: String(rating.source ?? ""),
    createdAt: String(rating.createdAt ?? ""),
  };
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
    for (const member of members) {
      const row = await resolvePublicRating(member);
      if (!row) continue;
      ratings.push(row);
    }
    return { ratings, configured: true };
  } catch {
    return { ratings: [], configured: false };
  }
}

/**
 * @param {{ limit?: number }} [opts]
 */
export async function listAdminRatings(opts = {}) {
  if (!isRedisConfigured() || !redis) {
    return { ratings: [], summary: await getRatingsSummary(), configured: false };
  }
  const limit = Math.min(
    500,
    Math.max(1, Number(opts.limit) || 200)
  );
  try {
    await backfillRatingsIndexIfNeeded();
    const members = await redis.zrange(RECENT_ZSET_KEY, 0, limit - 1, {
      rev: true,
    });
    const ratings = [];
    for (const member of Array.isArray(members) ? members : []) {
      const row = await resolveAdminRating(member);
      if (!row) continue;
      ratings.push(row);
    }
    return {
      ratings,
      summary: await getRatingsSummary(),
      configured: true,
    };
  } catch {
    return { ratings: [], summary: await getRatingsSummary(), configured: true };
  }
}

async function decrementRatingMeta(stars) {
  const n = Number(stars) || 0;
  if (n <= 0) return;
  await redis.hincrby(META_KEY, "count", -1);
  await redis.hincrby(META_KEY, "sum", -n);
  const meta = await redis.hgetall(META_KEY);
  const count = Number(meta?.count) || 0;
  const sum = Number(meta?.sum) || 0;
  if (count < 0) await redis.hset(META_KEY, { count: 0 });
  if (sum < 0) await redis.hset(META_KEY, { sum: 0 });
}

/**
 * @param {string} id
 */
export async function deleteRatingById(id) {
  if (!isRedisConfigured() || !redis) {
    return { ok: false, error: "redis_not_configured" };
  }
  const rid = String(id ?? "").trim();
  if (!rid) return { ok: false, error: "invalid_id" };

  try {
    if (rid.startsWith("g:")) {
      const guestId = rid.slice(2);
      const rating = await getGuestRatingById(guestId);
      if (!rating) return { ok: false, error: "not_found" };
      await redis.del(guestKey(guestId));
      await redis.zrem(RECENT_ZSET_KEY, guestIndexMember(guestId));
      await decrementRatingMeta(rating.stars);
      return { ok: true, summary: await getRatingsSummary() };
    }

    const orderNumber = rid.startsWith("o:") ? rid.slice(2) : rid;
    const rating = await getRatingByOrderNumber(orderNumber);
    if (!rating) return { ok: false, error: "not_found" };
    await redis.del(orderKey(orderNumber));
    await redis.zrem(RECENT_ZSET_KEY, orderIndexMember(orderNumber));
    await redis.zrem(RECENT_ZSET_KEY, String(orderNumber));
    await decrementRatingMeta(rating.stars);
    return { ok: true, summary: await getRatingsSummary() };
  } catch {
    return { ok: false, error: "delete_failed" };
  }
}

export async function deleteAllRatings() {
  if (!isRedisConfigured() || !redis) {
    return { ok: false, error: "redis_not_configured" };
  }
  try {
    const keys = [
      ...(await redis.keys(`${ORDER_KEY_PREFIX}*`)),
      ...(await redis.keys(`${GUEST_KEY_PREFIX}*`)),
      META_KEY,
      RECENT_ZSET_KEY,
    ];
    for (const key of keys) {
      await redis.del(key);
    }
    return { ok: true, summary: await getRatingsSummary() };
  } catch {
    return { ok: false, error: "delete_failed" };
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
    await incrementRatingMeta(stars);
    await indexRatingEntry(orderIndexMember(orderNumber), createdAt);
    const summary = await getRatingsSummary();
    return { ok: true, rating: row, summary };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}

/**
 * @param {{ name: string, stars: number, comment?: string, source?: string }} input
 */
export async function saveVisitorRating(input) {
  if (!isRedisConfigured() || !redis) {
    return { ok: false, error: "redis_not_configured" };
  }

  const customerName = normalizeName(input?.name);
  if (!customerName) {
    return { ok: false, error: "invalid_name" };
  }

  const stars = normalizeStars(input?.stars);
  if (stars === null) {
    return { ok: false, error: "invalid_stars" };
  }

  const comment = normalizeComment(input?.comment);
  const source =
    String(input?.source || "site").trim().slice(0, 32) || "site";
  const id = newGuestRatingId();
  const createdAt = new Date().toISOString();
  const row = {
    id,
    stars,
    comment,
    source,
    customerName,
    createdAt,
  };

  try {
    await redis.set(guestKey(id), JSON.stringify(row));
    await incrementRatingMeta(stars);
    await indexRatingEntry(guestIndexMember(id), createdAt);
    const summary = await getRatingsSummary();
    return { ok: true, rating: row, summary };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}
