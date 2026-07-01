export const PENDING_RATING_LS = "bh_pending_rating_v1";
export const RATING_REMINDER_DISMISS_LS = "bh_rating_reminder_dismiss_v1";
export const RATING_DONE_LS_PREFIX = "bh_rating_done_v1_";

const DISMISS_MS = 24 * 60 * 60 * 1000;
const PENDING_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const HIDE_REMINDER_PREFIXES = [
  "/admin",
  "/checkout",
  "/success",
  "/cancel",
  "/payment-error",
  "/pay/",
];

/** @param {string|number} orderNumber */
export function savePendingRating(orderNumber) {
  if (typeof window === "undefined") return;
  const on = String(orderNumber ?? "").trim();
  if (!on) return;
  try {
    window.localStorage.setItem(
      PENDING_RATING_LS,
      JSON.stringify({ orderNumber: on, savedAt: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function clearPendingRating() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_RATING_LS);
  } catch {
    /* ignore */
  }
}

/** @returns {{ orderNumber: string, savedAt: number } | null} */
export function getPendingRating() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_RATING_LS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const orderNumber = String(parsed?.orderNumber ?? "").trim();
    if (!orderNumber) return null;
    const savedAt = Number(parsed?.savedAt) || 0;
    if (Date.now() - savedAt > PENDING_MAX_AGE_MS) {
      clearPendingRating();
      return null;
    }
    return { orderNumber, savedAt };
  } catch {
    return null;
  }
}

/** @param {string|number} orderNumber */
export function markRatingDoneLocal(orderNumber) {
  if (typeof window === "undefined") return;
  const on = String(orderNumber ?? "").trim();
  if (!on) return;
  try {
    window.localStorage.setItem(`${RATING_DONE_LS_PREFIX}${on}`, "1");
    clearPendingRating();
  } catch {
    /* ignore */
  }
}

/** @param {string|number} orderNumber */
export function isRatingDoneLocal(orderNumber) {
  if (typeof window === "undefined") return false;
  const on = String(orderNumber ?? "").trim();
  if (!on) return false;
  try {
    return window.localStorage.getItem(`${RATING_DONE_LS_PREFIX}${on}`) === "1";
  } catch {
    return false;
  }
}

export function dismissRatingReminderForNow() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      RATING_REMINDER_DISMISS_LS,
      String(Date.now() + DISMISS_MS)
    );
  } catch {
    /* ignore */
  }
}

function isReminderDismissedForNow() {
  try {
    const until = Number(
      window.localStorage.getItem(RATING_REMINDER_DISMISS_LS)
    );
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

/** @param {string} [pathname] */
export function shouldShowRatingReminder(pathname = "") {
  if (typeof window === "undefined") return false;
  if (HIDE_REMINDER_PREFIXES.some((p) => pathname.startsWith(p))) {
    return false;
  }
  const pending = getPendingRating();
  if (!pending?.orderNumber) return false;
  if (isRatingDoneLocal(pending.orderNumber)) return false;
  if (isReminderDismissedForNow()) return false;
  return true;
}

/**
 * @param {{ orderNumber: string|number, stars: number, comment?: string, source?: string }} input
 */
export async function submitFoodRating(input) {
  const r = await fetch("/api/ratings/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderNumber: input.orderNumber,
      stars: input.stars,
      comment: input.comment || "",
      source: input.source || "success",
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (d?.ok || d?.error === "already_rated") {
    markRatingDoneLocal(input.orderNumber);
  }
  return { ok: Boolean(d?.ok), status: r.status, data: d };
}
