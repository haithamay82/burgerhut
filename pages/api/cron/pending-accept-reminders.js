import { authorizeAdminOrEmployee } from "@/lib/adminAuth";
import { broadcastPendingAcceptReminderToAdmins } from "@/lib/adminPushNotify";
import { isRedisConfigured, redis } from "@/lib/redis";
import { claimPendingAcceptReminders } from "@/lib/ordersStore";

const LOCK_KEY = "burgerhut:lock:pending-accept-reminders";
const LOCK_TTL_SEC = 45;

function authorizeCronOrStaff(req) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  const authHeader = String(req.headers.authorization || "").trim();
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, via: "cron" };
  }
  const staff = authorizeAdminOrEmployee(req);
  if (staff.ok) return { ok: true, via: staff.role };
  return { ok: false, reason: staff.reason || "unauthorized" };
}

async function tryAcquireLock() {
  if (!isRedisConfigured() || !redis) return true;
  try {
    const got = await redis.set(LOCK_KEY, String(Date.now()), {
      nx: true,
      ex: LOCK_TTL_SEC,
    });
    return got === "OK" || got === true;
  } catch {
    return true;
  }
}

/**
 * Scan pending orders (2–30 min old, not yet reminded) and send one batched push.
 */
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const auth = authorizeCronOrStaff(req);
  if (!auth.ok) {
    const status = auth.reason === "not_configured" ? 503 : 401;
    return res
      .status(status)
      .json({ ok: false, error: auth.reason || "unauthorized" });
  }

  const locked = await tryAcquireLock();
  if (!locked) {
    return res.status(200).json({ ok: true, reminded: 0, skipped: "locked" });
  }

  let claimed = [];
  try {
    claimed = await claimPendingAcceptReminders();
  } catch (e) {
    console.warn("[pendingAcceptReminder] claim failed", e?.message || e);
    return res.status(500).json({ ok: false, error: "claim_failed" });
  }

  if (!claimed.length) {
    return res.status(200).json({ ok: true, reminded: 0, results: [] });
  }

  const orderNumbers = claimed.map((o) => o?.orderNumber).filter((n) => n != null);

  try {
    const push = await broadcastPendingAcceptReminderToAdmins({ orderNumbers });
    return res.status(200).json({
      ok: true,
      reminded: claimed.length,
      pushOk: Boolean(push?.ok),
      orderNumbers,
    });
  } catch (e) {
    console.warn("[pendingAcceptReminder] push failed", e?.message || e);
    return res.status(200).json({
      ok: true,
      reminded: claimed.length,
      pushOk: false,
      orderNumbers,
    });
  }
}
