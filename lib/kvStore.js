import { kv } from "@vercel/kv";
import { isRedisConfigured, redis } from "@/lib/redis";

export function hasVercelKvEnv() {
  return Boolean(
    process.env.KV_REST_API_URL ||
      process.env.KV_URL ||
      process.env.KV_REST_API_TOKEN
  );
}

function hasUpstashRestEnv() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function isKvEnabled() {
  return hasVercelKvEnv() || hasUpstashRestEnv() || isRedisConfigured();
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

async function upstashGetRaw(key) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return null;
  try {
    const url = `${String(base).replace(/\/+$/, "")}/get/${encodeURIComponent(
      key
    )}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => ({}));
    return j?.result ?? null;
  } catch {
    return null;
  }
}

async function upstashDelKey(key) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return false;
  try {
    const url = `${String(base).replace(/\/+$/, "")}/del/${encodeURIComponent(key)}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function upstashSetJson(key, value) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return false;
  try {
    const url = `${String(base).replace(/\/+$/, "")}/set/${encodeURIComponent(key)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function kvGetJson(key) {
  /**
   * Vercel KV: תמיד @vercel/kv — אותו לקוח כמו בכתיבה.
   * אחרת redis.get החזיר null והקוד יצא בלי לנסות kv.get, בעוד שמחיקות נשמרו ב־kv.set
   * (למשל אחרי כשל שקט ב־redis.set עם טוקן read-only ואז הצלחה ב־kv.set).
   */
  if (hasVercelKvEnv()) {
    try {
      const raw = await kv.get(key);
      return parseMaybeJson(raw);
    } catch {
      return null;
    }
  }
  if (isRedisConfigured() && redis) {
    try {
      const v = await redis.get(key);
      if (v == null) return null;
      if (typeof v === "object") return v;
      return parseMaybeJson(v);
    } catch {
      /* fall through */
    }
  }
  if (!isKvEnabled()) return null;
  if (hasUpstashRestEnv()) {
    const raw = await upstashGetRaw(key);
    return parseMaybeJson(raw);
  }
  try {
    const raw = await kv.get(key);
    return parseMaybeJson(raw);
  } catch {
    return null;
  }
}

/** מחיקת מפתח — לרשימת סליידר ריקה (חלק ממימושי KV לא מחזירים {} ריק אמין אחרי set) */
export async function kvDelKey(key) {
  if (hasVercelKvEnv()) {
    try {
      await kv.del(key);
      return true;
    } catch {
      return false;
    }
  }
  if (isRedisConfigured() && redis) {
    try {
      await redis.del(key);
      return true;
    } catch {
      /* fall through */
    }
  }
  if (!isKvEnabled()) return false;
  if (hasUpstashRestEnv()) {
    return upstashDelKey(key);
  }
  try {
    await kv.del(key);
    return true;
  } catch {
    return false;
  }
}

export async function kvSetJson(key, value) {
  if (hasVercelKvEnv()) {
    try {
      await kv.set(key, value);
      return true;
    } catch {
      return false;
    }
  }
  if (isRedisConfigured() && redis) {
    try {
      await redis.set(key, value);
      return true;
    } catch {
      /* fall through */
    }
  }
  if (!isKvEnabled()) return false;
  if (hasUpstashRestEnv()) {
    return upstashSetJson(key, value);
  }
  try {
    await kv.set(key, value);
    return true;
  } catch {
    return false;
  }
}
