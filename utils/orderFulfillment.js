export const ORDER_FULFILLMENT_STATUSES = [
  "pending",
  "preparing",
  "ready",
  "delivered",
  "rejected",
];

export const ORDER_PREP_MINUTE_PRESETS = [
  10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60,
];

export const ORDER_PREP_MINUTES_MIN = 1;
export const ORDER_PREP_MINUTES_MAX = 180;

const EMPTY = Object.freeze({
  status: "pending",
  prepMinutes: null,
  prepEndsAt: null,
  acceptedAt: null,
  rejectedAt: null,
  readyAt: null,
  deliveredAt: null,
});

export function isValidFulfillmentStatus(s) {
  return ORDER_FULFILLMENT_STATUSES.includes(String(s || ""));
}

export function normalizePrepMinutes(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return null;
  if (n < ORDER_PREP_MINUTES_MIN || n > ORDER_PREP_MINUTES_MAX) return null;
  return n;
}

/**
 * @param {object | null | undefined} order
 */
export function readStoredFulfillment(order) {
  const f = order?.fulfillment;
  if (f && typeof f === "object" && !Array.isArray(f) && isValidFulfillmentStatus(f.status)) {
    return {
      status: String(f.status),
      prepMinutes:
        f.prepMinutes == null ? null : normalizePrepMinutes(f.prepMinutes),
      prepEndsAt:
        f.prepEndsAt != null && String(f.prepEndsAt).trim()
          ? String(f.prepEndsAt)
          : null,
      acceptedAt: f.acceptedAt ? String(f.acceptedAt) : null,
      rejectedAt: f.rejectedAt ? String(f.rejectedAt) : null,
      readyAt: f.readyAt ? String(f.readyAt) : null,
      deliveredAt: f.deliveredAt ? String(f.deliveredAt) : null,
    };
  }
  if (order?.meta?.adminDone || order?.meta?.adminDoneAt) {
    return {
      ...EMPTY,
      status: "delivered",
      deliveredAt: order?.meta?.adminDoneAt
        ? String(order.meta.adminDoneAt)
        : null,
    };
  }
  return { ...EMPTY };
}

/**
 * Effective fulfillment (auto-ready when prep timer elapsed).
 * @param {object | null | undefined} order
 * @param {number} [nowMs]
 */
export function resolveFulfillment(order, nowMs = Date.now()) {
  const f = readStoredFulfillment(order);
  if (f.status === "preparing" && f.prepEndsAt) {
    const ends = new Date(f.prepEndsAt).getTime();
    if (Number.isFinite(ends) && nowMs >= ends) {
      return {
        ...f,
        status: "ready",
        readyAt: f.readyAt || new Date(ends).toISOString(),
      };
    }
  }
  return f;
}

export function defaultFulfillmentForNewOrder() {
  return { ...EMPTY };
}

/**
 * Remaining ms until prep ends; 0 if done/expired; null if no timer.
 * @param {{ status?: string, prepEndsAt?: string | null }} fulfillment
 * @param {number} [nowMs]
 */
export function prepRemainingMs(fulfillment, nowMs = Date.now()) {
  if (!fulfillment || fulfillment.status !== "preparing") return null;
  const ends = new Date(fulfillment.prepEndsAt || "").getTime();
  if (!Number.isFinite(ends)) return null;
  return Math.max(0, ends - nowMs);
}

/** @param {number | null | undefined} ms */
export function formatCountdown(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function fulfillmentStatusLabelKey(status) {
  const s = String(status || "pending");
  if (s === "preparing") return "orderStatus.preparing";
  if (s === "ready") return "orderStatus.ready";
  if (s === "delivered") return "orderStatus.delivered";
  if (s === "rejected") return "orderStatus.rejected";
  return "orderStatus.pending";
}

export function fulfillmentStatusToneClass(status) {
  const s = String(status || "pending");
  if (s === "preparing") return "border-amber-500/50 bg-amber-950/40 text-amber-200";
  if (s === "ready") return "border-emerald-500/50 bg-emerald-950/40 text-emerald-200";
  if (s === "delivered") return "border-sky-500/50 bg-sky-950/40 text-sky-200";
  if (s === "rejected") return "border-red-500/50 bg-red-950/40 text-red-200";
  return "border-slate-500/50 bg-slate-900/60 text-slate-200";
}
