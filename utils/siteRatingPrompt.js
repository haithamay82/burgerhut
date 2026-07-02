export const SITE_RATING_NEVER_LS = "bh_site_rating_never_v1";
export const SITE_RATING_SESSION_DISMISS_SS = "bh_site_rating_session_dismiss_v1";
export const SITE_RATING_SUBMITTED_LS = "bh_site_rating_submitted_v1";

const HIDE_SITE_RATING_PREFIXES = [
  "/admin",
  "/checkout",
  "/success",
  "/cancel",
  "/payment-error",
  "/pay/",
];

export function permanentlyDismissSiteRating() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SITE_RATING_NEVER_LS, "1");
  } catch {
    /* ignore */
  }
}

export function dismissSiteRatingForSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SITE_RATING_SESSION_DISMISS_SS, "1");
  } catch {
    /* ignore */
  }
}

export function markSiteRatingSubmitted() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SITE_RATING_SUBMITTED_LS, "1");
    permanentlyDismissSiteRating();
  } catch {
    /* ignore */
  }
}

function isSiteRatingPermanentlyDismissed() {
  try {
    return (
      window.localStorage.getItem(SITE_RATING_NEVER_LS) === "1" ||
      window.localStorage.getItem(SITE_RATING_SUBMITTED_LS) === "1"
    );
  } catch {
    return false;
  }
}

function isSiteRatingDismissedForSession() {
  try {
    return window.sessionStorage.getItem(SITE_RATING_SESSION_DISMISS_SS) === "1";
  } catch {
    return false;
  }
}

/** @param {string} [pathname] */
export function shouldShowSiteRatingDialog(pathname = "") {
  if (typeof window === "undefined") return false;
  if (HIDE_SITE_RATING_PREFIXES.some((p) => pathname.startsWith(p))) {
    return false;
  }
  if (isSiteRatingPermanentlyDismissed()) return false;
  if (isSiteRatingDismissedForSession()) return false;
  return true;
}

/**
 * @param {{ name: string, stars: number, source?: string }} input
 */
export async function submitVisitorRating(input) {
  const r = await fetch("/api/ratings/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      stars: input.stars,
      source: input.source || "site",
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (d?.ok) {
    markSiteRatingSubmitted();
    try {
      window.dispatchEvent(new CustomEvent("bh-rating-updated"));
    } catch {
      /* ignore */
    }
  }
  return { ok: Boolean(d?.ok), status: r.status, data: d };
}
