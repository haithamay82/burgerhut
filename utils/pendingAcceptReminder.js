import { resolveFulfillment } from "@/utils/orderFulfillment";

/** First reminder after this age; repeats while still pending. */
export const PENDING_ACCEPT_REMINDER_AFTER_MS = 2 * 60 * 1000;

function toMs(ts) {
  const x = new Date(String(ts || "")).getTime();
  return Number.isFinite(x) ? x : 0;
}

/**
 * True when a pending order is due for an accept/reject reminder.
 * @param {object} order
 * @param {number} [now]
 */
export function orderNeedsPendingAcceptReminder(order, now = Date.now()) {
  if (!order || typeof order !== "object") return false;
  const f = resolveFulfillment(order);
  if (f.status !== "pending") return false;
  const created = toMs(order.createdAt);
  if (!created || now - created < PENDING_ACCEPT_REMINDER_AFTER_MS) {
    return false;
  }
  const meta =
    order.meta && typeof order.meta === "object" && !Array.isArray(order.meta)
      ? order.meta
      : {};
  const last = toMs(meta.pendingAcceptReminderSentAt);
  if (last && now - last < PENDING_ACCEPT_REMINDER_AFTER_MS) {
    return false;
  }
  return true;
}
