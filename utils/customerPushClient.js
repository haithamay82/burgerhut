import { isStandalonePwaDisplay } from "@/utils/pwaDisplay";
import {
  getOrCreateCustomerPushDeviceId,
  isValidPushClientId,
} from "@/utils/customerPushClientId";
import { clearPwaJustInstalledFlag } from "@/utils/pwaNotificationPrompt";

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
 * @returns {Promise<boolean>}
 */
export async function getCustomerLocalPushSubscribed() {
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

async function saveSubscriptionToServer(sub) {
  const pushClientId = getOrCreateCustomerPushDeviceId();
  if (!isValidPushClientId(pushClientId)) {
    return { ok: false, error: "no_push_client_id" };
  }
  const r = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    return { ok: false, error: d.error || "subscribe_failed" };
  }
  return { ok: true };
}

async function subscribeAfterPermissionGranted() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const rk = await fetch("/api/push/vapid-public");
    const rj = await rk.json().catch(() => ({}));
    if (!rj.ok || !rj.publicKey) {
      return { ok: false, error: "no_vapid" };
    }
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(String(rj.publicKey)),
    });
  }
  return saveSubscriptionToServer(sub);
}

/**
 * סנכרון שקט — רק אם כבר יש הרשאת התראות (ללא חלון מערכת).
 */
export async function syncPwaCustomerPushIfGranted() {
  if (typeof window === "undefined") {
    return { ok: false, error: "no_window" };
  }
  if (!isStandalonePwaDisplay()) {
    return { ok: false, error: "not_pwa" };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "push_unavailable" };
  }
  if (typeof Notification === "undefined") {
    return { ok: false, error: "notifications_unavailable" };
  }
  if (Notification.permission !== "granted") {
    return { ok: false, error: "permission_not_granted" };
  }
  try {
    return subscribeAfterPermissionGranted();
  } catch {
    return { ok: false, error: "subscribe_failed" };
  }
}

/**
 * אחרי לחיצת המשתמש — מבקש הרשאת התראות (חלון מערכת) ורושם Push.
 */
export async function registerPwaCustomerPushOnUserAction() {
  if (typeof window === "undefined") {
    return { ok: false, error: "no_window" };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "push_unavailable" };
  }
  if (typeof Notification === "undefined") {
    return { ok: false, error: "notifications_unavailable" };
  }
  if (Notification.permission === "denied") {
    return { ok: false, error: "permission_denied" };
  }

  try {
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        return { ok: false, error: "permission_denied" };
      }
    }
    const result = await subscribeAfterPermissionGranted();
    if (result.ok) {
      clearPwaJustInstalledFlag();
    }
    return result;
  } catch {
    return { ok: false, error: "subscribe_failed" };
  }
}

/** @deprecated use syncPwaCustomerPushIfGranted or registerPwaCustomerPushOnUserAction */
export async function ensurePwaCustomerPushRegistered() {
  if (Notification.permission === "granted") {
    return syncPwaCustomerPushIfGranted();
  }
  return registerPwaCustomerPushOnUserAction();
}
