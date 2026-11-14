import { resolveFulfillment } from "@/utils/orderFulfillment";

/** Reminder cadence while still pending. */
export const PENDING_ACCEPT_REMINDER_AFTER_MS = 1 * 60 * 1000;

/**
 * Ignore stuck/old pending rows so historical orders cannot flood devices.
 */
export const PENDING_ACCEPT_REMINDER_MAX_AGE_MS = 45 * 60 * 1000;

function toMs(ts) {
  const x = new Date(String(ts || "")).getTime();
  return Number.isFinite(x) ? x : 0;
}

/**
 * Pending order due for accept/reject reminder (age 1–45 min, cadence 1 min).
 * @param {object} order
 * @param {number} [now]
 */
export function orderNeedsPendingAcceptReminder(order, now = Date.now()) {
  if (!order || typeof order !== "object") return false;
  const f = resolveFulfillment(order);
  if (f.status !== "pending") return false;
  const created = toMs(order.createdAt);
  if (!created) return false;
  const age = now - created;
  if (age < PENDING_ACCEPT_REMINDER_AFTER_MS) return false;
  if (age > PENDING_ACCEPT_REMINDER_MAX_AGE_MS) return false;
  const meta =
    order.meta && typeof order.meta === "object" && !Array.isArray(order.meta)
      ? order.meta
      : {};
  const last = toMs(meta.pendingAcceptReminderSentAt);
  if (last && now - last < PENDING_ACCEPT_REMINDER_AFTER_MS) return false;
  return true;
}
