import { resolveFulfillment } from "@/utils/orderFulfillment";

/** First (and only) reminder after this age while still pending. */
export const PENDING_ACCEPT_REMINDER_AFTER_MS = 2 * 60 * 1000;

/**
 * Do not remind for stuck/old pending rows (avoids a flood of historical orders).
 */
export const PENDING_ACCEPT_REMINDER_MAX_AGE_MS = 30 * 60 * 1000;

function toMs(ts) {
  const x = new Date(String(ts || "")).getTime();
  return Number.isFinite(x) ? x : 0;
}

/**
 * True when a pending order is due for a one-shot accept/reject reminder.
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
  // One reminder only — never re-spam the same order.
  if (meta.pendingAcceptReminderSentAt) return false;
  return true;
}
