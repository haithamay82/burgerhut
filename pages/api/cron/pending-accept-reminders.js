import { authorizeAdminOrEmployee } from "@/lib/adminAuth";
import { broadcastPendingAcceptReminderToAdmins } from "@/lib/adminPushNotify";
import { claimPendingAcceptReminders } from "@/lib/ordersStore";

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

/**
 * Scan pending orders older than 2 minutes and push accept/reject reminders.
 * Auth: Vercel Cron (Bearer CRON_SECRET) or x-admin-secret (admin/employee).
 */
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const auth = authorizeCronOrStaff(req);
  if (!auth.ok) {
    const status = auth.reason === "not_configured" ? 503 : 401;
    return res.status(status).json({ ok: false, error: auth.reason || "unauthorized" });
  }

  let claimed = [];
  try {
    claimed = await claimPendingAcceptReminders();
  } catch (e) {
    console.warn(
      "[pendingAcceptReminder] claim failed",
      e?.message || e
    );
    return res.status(500).json({ ok: false, error: "claim_failed" });
  }

  const results = [];
  for (const order of claimed) {
    try {
      const push = await broadcastPendingAcceptReminderToAdmins({
        orderNumber: order?.orderNumber,
      });
      results.push({
        orderId: order?.id,
        orderNumber: order?.orderNumber,
        pushOk: Boolean(push?.ok),
      });
    } catch (e) {
      console.warn(
        "[pendingAcceptReminder] push failed",
        e?.message || e
      );
      results.push({
        orderId: order?.id,
        orderNumber: order?.orderNumber,
        pushOk: false,
      });
    }
  }

  return res.status(200).json({
    ok: true,
    reminded: claimed.length,
    results,
  });
}
