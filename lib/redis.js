import { Redis } from "@upstash/redis";

function resolveRedisUrl() {
  return (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    ""
  );
}

function resolveRedisToken() {
  return (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.KV_REST_API_READ_ONLY_TOKEN ||
    ""
  );
}

export function isRedisConfigured() {
  return Boolean(resolveRedisUrl() && resolveRedisToken());
}

export const redis = isRedisConfigured()
  ? new Redis({
      url: resolveRedisUrl(),
      token: resolveRedisToken(),
    })
  : null;
