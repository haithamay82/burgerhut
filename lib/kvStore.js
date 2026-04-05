import { kv } from "@vercel/kv";
import { isRedisConfigured, redis } from "@/lib/redis";

function hasVercelKvEnv() {
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
  if (isRedisConfigured() && redis) {
    try {
      const v = await redis.get(key);
      if (v == null) return null;
      if (typeof v === "object") return v;
      return parseMaybeJson(v);
    } catch {
      /* fall through to legacy paths */
    }
  }
  if (!isKvEnabled()) return null;
  if (!hasVercelKvEnv() && hasUpstashRestEnv()) {
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

export async function kvSetJson(key, value) {
  if (isRedisConfigured() && redis) {
    try {
      await redis.set(key, value);
      return true;
    } catch {
      /* fall through — e.g. read-only token */
    }
  }
  if (!isKvEnabled()) return false;
  if (!hasVercelKvEnv() && hasUpstashRestEnv()) {
    return upstashSetJson(key, value);
  }
  try {
    await kv.set(key, value);
    return true;
  } catch {
    return false;
  }
}
