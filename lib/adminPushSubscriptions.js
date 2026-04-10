import { redis, isRedisConfigured } from "@/lib/redis";

const HASH_KEY = "burgerhut:admin_push_subscriptions";

/**
 * @param {import("web-push").PushSubscription} sub
 */
export async function saveAdminPushSubscription(sub) {
  if (!redis || !isRedisConfigured()) {
    return { ok: false, error: "redis_not_configured" };
  }
  const endpoint = String(sub?.endpoint || "").trim();
  if (!endpoint) return { ok: false, error: "invalid_subscription" };
  try {
    await redis.hset(HASH_KEY, endpoint, JSON.stringify(sub));
    return { ok: true };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}

export async function removeAdminPushSubscriptionByEndpoint(endpoint) {
  if (!redis || !isRedisConfigured()) return;
  const ep = String(endpoint || "").trim();
  if (!ep) return;
  try {
    await redis.hdel(HASH_KEY, ep);
  } catch {
    /* ignore */
  }
}

/** @returns {Promise<import("web-push").PushSubscription[]>} */
/** @returns {Promise<number>} */
export async function countAdminPushSubscriptions() {
  if (!redis || !isRedisConfigured()) return 0;
  try {
    const n = await redis.hlen(HASH_KEY);
    return Number(n) || 0;
  } catch {
    return 0;
  }
}

export async function listAdminPushSubscriptions() {
  if (!redis || !isRedisConfigured()) return [];
  try {
    const all = await redis.hgetall(HASH_KEY);
    if (!all || typeof all !== "object") return [];
    return Object.values(all)
      .map((s) => {
        try {
          return JSON.parse(String(s));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
