import {
  getOrCreateAdminPushDeviceId,
  isValidPushClientId,
} from "@/utils/adminPushClientId";

/** @param {string} base64String */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * האם קיים מנוי Push מקומי (Service Worker) במכשיר הזה.
 * @returns {Promise<boolean>}
 */
export async function getAdminLocalPushSubscribed() {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}

/**
 * רישום Web Push למכשיר הנוכחי (אחרי הרשאת התראות).
 * @param {string} adminSecret
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function subscribeAdminWebPush(adminSecret) {
  if (typeof window === "undefined") {
    return { ok: false, error: "no_window" };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "push_unavailable" };
  }
  const secret = String(adminSecret || "").trim();
  if (!secret) return { ok: false, error: "no_secret" };

  const rk = await fetch("/api/admin/push/vapid-public");
  const rj = await rk.json().catch(() => ({}));
  if (!rj.ok || !rj.publicKey) {
    return { ok: false, error: "no_vapid" };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      try {
        await existing.unsubscribe();
      } catch {
        /* ignore */
      }
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(String(rj.publicKey)),
    });
    const pushClientId = getOrCreateAdminPushDeviceId();
    if (!isValidPushClientId(pushClientId)) {
      return { ok: false, error: "no_push_client_id" };
    }
    const r = await fetch("/api/admin/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": secret,
      },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        pushClientId,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) {
      if (d.error === "redis_not_configured") {
        return { ok: false, error: "redis_not_configured" };
      }
      if (d.error === "invalid_push_client_id") {
        return { ok: false, error: "invalid_push_client_id" };
      }
      return { ok: false, error: d.error || "subscribe_failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "subscribe_failed" };
  }
}

/**
 * הסרת המנוי מהשרת וביטול subscription מקומי (למשל בהתנתקות).
 * @param {string} adminSecret
 */
export async function unsubscribeAdminWebPush(adminSecret) {
  if (typeof window === "undefined") return;
  const secret = String(adminSecret || "").trim();
  if (!secret) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    const pushClientId = getOrCreateAdminPushDeviceId();
    await fetch("/api/admin/push/unsubscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": secret,
      },
      body: JSON.stringify({
        endpoint,
        ...(isValidPushClientId(pushClientId) ? { pushClientId } : {}),
      }),
    }).catch(() => {});
    await sub.unsubscribe();
  } catch {
    /* ignore */
  }
}
