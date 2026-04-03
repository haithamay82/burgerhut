import { redis, isRedisConfigured } from "@/lib/redis";

const KEY_PREFIX = "bh:sitevisit:";
const KEY_TTL_SEC = 86400 * 120; // ~4 חודשים — איסוף ימים בלבד

function authorize(req) {
  const secret = process.env.ADMIN_ORDERS_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };
  const header = req.headers["x-admin-secret"];
  if (!header || header !== secret) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

function jerusalemYmdParts(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const y = +p.find((x) => x.type === "year")?.value;
  const m = +p.find((x) => x.type === "month")?.value;
  const day = +p.find((x) => x.type === "day")?.value;
  return { y, m, d: day };
}

function ymdToKey({ y, m, d }) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDaysYmd(ymd, delta) {
  const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + delta));
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
  };
}

function lastNJerusalemDayKeys(n) {
  let cur = jerusalemYmdParts(new Date());
  const keys = [];
  for (let i = 0; i < n; i += 1) {
    keys.push(ymdToKey(cur));
    cur = addDaysYmd(cur, -1);
  }
  return keys;
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    if (!isRedisConfigured() || !redis) {
      return res.status(200).json({
        ok: true,
        recorded: false,
        error: "redis_not_configured",
      });
    }

    let body = {};
    try {
      if (typeof req.body === "string") body = JSON.parse(req.body || "{}");
      else if (req.body && typeof req.body === "object") body = req.body;
    } catch {
      body = {};
    }
    const ch = String(body.channel || "").toLowerCase();
    const channel = ch === "pwa" ? "pwa" : "web";
    const dayKey = ymdToKey(jerusalemYmdParts(new Date()));
    const rkey = `${KEY_PREFIX}${dayKey}`;

    try {
      await redis.hincrby(rkey, "t", 1);
      await redis.hincrby(rkey, channel === "pwa" ? "p" : "w", 1);
      await redis.expire(rkey, KEY_TTL_SEC);
      return res.status(200).json({ ok: true, recorded: true, day: dayKey });
    } catch {
      return res.status(500).json({ ok: false, error: "visit_write_failed" });
    }
  }

  if (req.method === "GET") {
    const auth = authorize(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "admin_not_configured" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (!isRedisConfigured() || !redis) {
      return res.status(503).json({ ok: false, error: "redis_not_configured" });
    }

    const rawDays = Number(req.query.days);
    const days = Math.min(
      90,
      Math.max(1, Number.isFinite(rawDays) ? rawDays : 31)
    );
    const keys = lastNJerusalemDayKeys(days);

    try {
      const daysOut = await Promise.all(
        keys.map(async (date) => {
          const data = await redis.hgetall(`${KEY_PREFIX}${date}`);
          const total = Number(data?.t ?? 0) || 0;
          const web = Number(data?.w ?? 0) || 0;
          const pwa = Number(data?.p ?? 0) || 0;
          return { date, total, web, pwa };
        })
      );
      return res.status(200).json({ ok: true, days: daysOut });
    } catch {
      return res.status(500).json({ ok: false, error: "visit_read_failed" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
