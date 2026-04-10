import { kv } from "@vercel/kv";
import { hasVercelKvEnv } from "@/lib/kvStore";
import { redis, isRedisConfigured } from "@/lib/redis";

const HASH_KEY = "burgerhut:admin_push_subscriptions";

const HDEL_CHUNK = 40;

/**
 * לקוח Redis למנויי Push: כשיש Vercel KV — אותו מאגר כמו הזמנות/קטלוג.
 * אם בנוסף מוגדר UPSTASH_REDIS_*, lib/redis.js היה בוחר בו קודם ונוצר פיצול (ספירה/ניקוי מול מאגר אחר).
 */
function getPushClient() {
  if (hasVercelKvEnv()) return kv;
  if (isRedisConfigured() && redis) return redis;
  return null;
}

export function isAdminPushStorageConfigured() {
  return getPushClient() != null;
}

/**
 * @param {import("web-push").PushSubscription} sub
 */
export async function saveAdminPushSubscription(sub) {
  const client = getPushClient();
  if (!client) {
    return { ok: false, error: "redis_not_configured" };
  }
  const endpoint = String(sub?.endpoint || "").trim();
  if (!endpoint) return { ok: false, error: "invalid_subscription" };
  try {
    await client.hset(HASH_KEY, endpoint, JSON.stringify(sub));
    return { ok: true };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}

export async function removeAdminPushSubscriptionByEndpoint(endpoint) {
  const client = getPushClient();
  if (!client) return;
  const ep = String(endpoint || "").trim();
  if (!ep) return;
  try {
    await client.hdel(HASH_KEY, ep);
  } catch {
    /* ignore */
  }
}

/** @returns {Promise<number>} */
export async function countAdminPushSubscriptions() {
  const client = getPushClient();
  if (!client) return 0;
  try {
    const n = await client.hlen(HASH_KEY);
    return Number(n) || 0;
  } catch {
    return 0;
  }
}

/** מוחק את כל מנויי Push של מנהלים (מפתח ה־hash). מאמת ש־HLEN=0. */
export async function clearAllAdminPushSubscriptions() {
  const client = getPushClient();
  if (!client) {
    return { ok: false, error: "redis_not_configured" };
  }
  try {
    await client.del(HASH_KEY);
    let left = Number(await client.hlen(HASH_KEY)) || 0;
    if (left > 0) {
      const all = await client.hgetall(HASH_KEY);
      const fields = Object.keys(all || {});
      for (let i = 0; i < fields.length; i += HDEL_CHUNK) {
        const chunk = fields.slice(i, i + HDEL_CHUNK);
        if (chunk.length > 0) {
          await client.hdel(HASH_KEY, ...chunk);
        }
      }
      await client.del(HASH_KEY);
      left = Number(await client.hlen(HASH_KEY)) || 0;
    }
    if (left !== 0) {
      return { ok: false, error: "clear_verify_failed" };
    }
    return { ok: true, subscriptionCount: 0 };
  } catch {
    return { ok: false, error: "clear_failed" };
  }
}

export async function listAdminPushSubscriptions() {
  const client = getPushClient();
  if (!client) return [];
  try {
    const all = await client.hgetall(HASH_KEY);
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
