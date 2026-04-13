import { kv } from "@vercel/kv";
import { hasVercelKvEnv } from "@/lib/kvStore";
import { redis, isRedisConfigured } from "@/lib/redis";
import { isValidPushClientId } from "@/utils/adminPushClientId";

const HASH_KEY = "burgerhut:admin_push_subscriptions";

const HDEL_CHUNK = 40;

const DEVICE_FIELD_PREFIX = "d:";

function hashFieldForSubscription(sub, pushClientId) {
  const endpoint = String(sub?.endpoint || "").trim();
  if (!endpoint) return null;
  const id = String(pushClientId || "").trim();
  if (isValidPushClientId(id)) {
    return `${DEVICE_FIELD_PREFIX}${id}`;
  }
  return endpoint;
}

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
 * מוחק משדות ה-hash כל ערך שמפנה לאותו endpoint (שמירה על מנוי אחד ל-endpoint).
 * מונע צבירת שדות d:... ישנים אחרי ניקוי localStorage / מכשיר.
 */
async function removeDuplicatePushEndpoints(client, keepFieldKey, endpoint) {
  const ep = String(endpoint || "").trim();
  if (!ep || !keepFieldKey) return;
  let all;
  try {
    all = await client.hgetall(HASH_KEY);
  } catch {
    return;
  }
  if (!all || typeof all !== "object") return;
  const toDel = [];
  for (const [k, raw] of Object.entries(all)) {
    if (k === keepFieldKey) continue;
    try {
      const j = JSON.parse(String(raw));
      if (String(j?.endpoint || "").trim() === ep) toDel.push(k);
    } catch {
      /* ignore */
    }
  }
  for (let i = 0; i < toDel.length; i += HDEL_CHUNK) {
    const chunk = toDel.slice(i, i + HDEL_CHUNK);
    if (chunk.length) {
      try {
        await client.hdel(HASH_KEY, ...chunk);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function saveAdminPushSubscription(sub, pushClientId) {
  const client = getPushClient();
  if (!client) {
    return { ok: false, error: "redis_not_configured" };
  }
  const endpoint = String(sub?.endpoint || "").trim();
  if (!endpoint) return { ok: false, error: "invalid_subscription" };
  const fieldKey = hashFieldForSubscription(sub, pushClientId);
  if (!fieldKey) return { ok: false, error: "invalid_subscription" };
  try {
    await client.hset(HASH_KEY, fieldKey, JSON.stringify(sub));
    await removeDuplicatePushEndpoints(client, fieldKey, endpoint);
    return { ok: true };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}

export async function removeAdminPushSubscriptionByPushClientId(pushClientId) {
  const client = getPushClient();
  if (!client || !isValidPushClientId(pushClientId)) return;
  try {
    await client.hdel(HASH_KEY, `${DEVICE_FIELD_PREFIX}${String(pushClientId).trim()}`);
  } catch {
    /* ignore */
  }
}

export async function removeAdminPushSubscriptionByEndpoint(endpoint) {
  const client = getPushClient();
  if (!client) return;
  const ep = String(endpoint || "").trim();
  if (!ep) return;
  try {
    const n = await client.hdel(HASH_KEY, ep);
    if (Number(n) > 0) return;
    const all = await client.hgetall(HASH_KEY);
    for (const [k, v] of Object.entries(all || {})) {
      try {
        const j = JSON.parse(String(v));
        if (String(j?.endpoint || "") === ep) {
          await client.hdel(HASH_KEY, k);
          return;
        }
      } catch {
        /* next */
      }
    }
  } catch {
    /* ignore */
  }
}

/** מספר מנויים לתצוגה / שידור — ייחודי לפי endpoint (לא HLEN שמונה שדות יתומים). */
export async function countAdminPushSubscriptions() {
  const list = await listAdminPushSubscriptions();
  return list.length;
}

/**
 * מוחק את כל מנויי Push של מנהלים (מפתח ה־hash).
 * לא סומכים על DEL בלבד — חלק מהסביבות משאירות hash חלקי; מוחקים שדות אחד־אחד.
 */
export async function clearAllAdminPushSubscriptions() {
  const client = getPushClient();
  if (!client) {
    return { ok: false, error: "redis_not_configured" };
  }
  const MAX_PASSES = 5;
  try {
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      let all;
      try {
        all = await client.hgetall(HASH_KEY);
      } catch {
        all = null;
      }
      const fields = Object.keys(all || {});
      if (!fields.length) break;
      for (let i = 0; i < fields.length; i += HDEL_CHUNK) {
        const chunk = fields.slice(i, i + HDEL_CHUNK);
        if (chunk.length > 0) {
          await client.hdel(HASH_KEY, ...chunk);
        }
      }
      try {
        await client.del(HASH_KEY);
      } catch {
        /* ignore */
      }
    }
    const remaining = (await listAdminPushSubscriptions()).length;
    if (remaining !== 0) {
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
    const parsed = Object.values(all)
      .map((s) => {
        try {
          return JSON.parse(String(s));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const sub of parsed) {
      const ep = String(sub?.endpoint || "").trim();
      if (!ep || seen.has(ep)) continue;
      seen.add(ep);
      out.push(sub);
    }
    return out;
  } catch {
    return [];
  }
}
