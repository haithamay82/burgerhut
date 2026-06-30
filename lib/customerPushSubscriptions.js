import { kv } from "@vercel/kv";
import { hasVercelKvEnv } from "@/lib/kvStore";
import { redis, isRedisConfigured } from "@/lib/redis";
import { isValidPushClientId } from "@/utils/customerPushClientId";

const HASH_KEY = "burgerhut:customer_push_subscriptions";

const HDEL_CHUNK = 40;

const DEVICE_FIELD_PREFIX = "d:";

function parseStoredSubscription(raw) {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw) && raw.endpoint != null) {
    return raw;
  }
  try {
    const j = JSON.parse(String(raw));
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

function hashFieldForSubscription(sub, pushClientId) {
  const endpoint = String(sub?.endpoint || "").trim();
  if (!endpoint) return null;
  const id = String(pushClientId || "").trim();
  if (isValidPushClientId(id)) {
    return `${DEVICE_FIELD_PREFIX}${id}`;
  }
  return endpoint;
}

function getPushClient() {
  if (hasVercelKvEnv()) return kv;
  if (isRedisConfigured() && redis) return redis;
  return null;
}

export function isCustomerPushStorageConfigured() {
  return getPushClient() != null;
}

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
    const j = parseStoredSubscription(raw);
    if (j && String(j.endpoint || "").trim() === ep) toDel.push(k);
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

export async function saveCustomerPushSubscription(sub, pushClientId) {
  const client = getPushClient();
  if (!client) {
    return { ok: false, error: "redis_not_configured" };
  }
  const endpoint = String(sub?.endpoint || "").trim();
  if (!endpoint) return { ok: false, error: "invalid_subscription" };
  const fieldKey = hashFieldForSubscription(sub, pushClientId);
  if (!fieldKey) return { ok: false, error: "invalid_subscription" };
  try {
    await client.hset(HASH_KEY, { [fieldKey]: JSON.stringify(sub) });
    await removeDuplicatePushEndpoints(client, fieldKey, endpoint);
    return { ok: true };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}

export async function removeCustomerPushSubscriptionByPushClientId(pushClientId) {
  const client = getPushClient();
  if (!client || !isValidPushClientId(pushClientId)) return;
  try {
    await client.hdel(
      HASH_KEY,
      `${DEVICE_FIELD_PREFIX}${String(pushClientId).trim()}`
    );
  } catch {
    /* ignore */
  }
}

export async function removeCustomerPushSubscriptionByEndpoint(endpoint) {
  const client = getPushClient();
  if (!client) return;
  const ep = String(endpoint || "").trim();
  if (!ep) return;
  try {
    const n = await client.hdel(HASH_KEY, ep);
    if (Number(n) > 0) return;
    const all = await client.hgetall(HASH_KEY);
    for (const [k, v] of Object.entries(all || {})) {
      const j = parseStoredSubscription(v);
      if (j && String(j.endpoint || "") === ep) {
        await client.hdel(HASH_KEY, k);
        return;
      }
    }
  } catch {
    /* ignore */
  }
}

export async function countCustomerPushSubscriptions() {
  const list = await listCustomerPushSubscriptions();
  return list.length;
}

export async function listCustomerPushSubscriptions() {
  const client = getPushClient();
  if (!client) return [];
  try {
    const all = await client.hgetall(HASH_KEY);
    if (!all || typeof all !== "object") return [];
    const parsed = Object.values(all)
      .map((s) => parseStoredSubscription(s))
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
