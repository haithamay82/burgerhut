import webpush from "web-push";
import {
  getCustomerPushSubscriptionByClientId,
  listCustomerPushSubscriptions,
  removeCustomerPushSubscriptionByEndpoint,
} from "@/lib/customerPushSubscriptions";
import { isStalePushSubscriptionError } from "@/lib/adminPushNotify";
import { isValidPushClientId } from "@/utils/customerPushClientId";

let vapidReady = false;

function ensureWebPushConfigured() {
  if (vapidReady) return true;
  const pub = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const priv = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(
    process.env.VAPID_SUBJECT || "mailto:admin@burgerhut.local"
  ).trim();
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(subject, pub, priv);
    vapidReady = true;
    return true;
  } catch {
    return false;
  }
}

const PUSH_SEND_CONCURRENCY = 25;
const CUSTOMER_PUSH_BODY_MAX_CHARS = 500;
const CUSTOMER_PUSH_TITLE_MAX_CHARS = 80;

/**
 * @param {string} payload JSON
 * @returns {Promise<{ ok: true, sent: number, failed: number, removed: number } | { ok: false, error: string }>}
 */
async function broadcastCustomerPushPayload(payload) {
  if (!ensureWebPushConfigured()) {
    return { ok: false, error: "vapid_not_configured" };
  }
  const subs = await listCustomerPushSubscriptions();
  if (!subs.length) {
    return { ok: false, error: "no_subscriptions" };
  }

  let sent = 0;
  let failed = 0;
  let removed = 0;

  const sendOne = async (sub) => {
    try {
      await webpush.sendNotification(sub, payload, {
        TTL: 86400,
        urgency: "normal",
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      const status = Number(e?.statusCode);
      console.warn(
        "[customerPush] send failed",
        Number.isFinite(status) && status > 0 ? status : "?",
        e?.message || e
      );
      if (isStalePushSubscriptionError(status)) {
        await removeCustomerPushSubscriptionByEndpoint(sub?.endpoint);
        removed += 1;
      }
    }
  };

  for (let i = 0; i < subs.length; i += PUSH_SEND_CONCURRENCY) {
    const chunk = subs.slice(i, i + PUSH_SEND_CONCURRENCY);
    await Promise.all(chunk.map((sub) => sendOne(sub)));
  }

  return { ok: true, sent, failed, removed };
}

/** @param {string} raw */
function normalizeCustomerBroadcastUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "/";
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  return s.slice(0, 200);
}

/**
 * שליחת הודעת שיווק/עדכון לכל מנויי PWA (לקוחות).
 * @param {{ title?: string, body?: string, url?: string }} p
 */
export async function broadcastCustomerPromoPush(p) {
  const title = String(p?.title || "").trim().slice(0, CUSTOMER_PUSH_TITLE_MAX_CHARS);
  let body = String(p?.body || "").trim();
  if (!title || !body) {
    return { ok: false, error: "invalid_content" };
  }
  if (body.length > CUSTOMER_PUSH_BODY_MAX_CHARS) {
    body = `${body.slice(0, CUSTOMER_PUSH_BODY_MAX_CHARS - 1)}…`;
  }
  const url = normalizeCustomerBroadcastUrl(p?.url);
  if (url == null) {
    return { ok: false, error: "invalid_url" };
  }

  const payload = JSON.stringify({
    title: `Burger Hut — ${title}`,
    body,
    url,
    tag: `bh-customer-${Date.now()}`,
    audience: "customer",
    sentAt: Date.now(),
  });

  return broadcastCustomerPushPayload(payload);
}

/**
 * התראת סטטוס הזמנה למכשיר הלקוח שקשור להזמנה (PWA).
 * @param {{
 *   order?: object,
 *   event: "accepted" | "rejected" | "ready" | "delivered",
 * }} p
 */
export async function notifyCustomerOrderFulfillmentPush(p) {
  const order = p?.order;
  const event = String(p?.event || "").trim();
  if (
    !order ||
    !["accepted", "rejected", "ready", "delivered"].includes(event)
  ) {
    return { ok: false, error: "invalid_params" };
  }
  if (!ensureWebPushConfigured()) {
    return { ok: false, error: "vapid_not_configured" };
  }

  const pushClientId = String(
    order?.meta?.customerPushClientId || ""
  ).trim();
  if (!isValidPushClientId(pushClientId)) {
    return { ok: false, error: "no_customer_push_client" };
  }
  const sub = await getCustomerPushSubscriptionByClientId(pushClientId);
  if (!sub) {
    return { ok: false, error: "no_subscription" };
  }

  const on =
    order.orderNumber != null && String(order.orderNumber).trim() !== ""
      ? String(order.orderNumber).trim()
      : "";
  const prepMins = Number(order?.fulfillment?.prepMinutes);
  const methodRaw = String(order?.payment || "cash").trim().toLowerCase();
  const method =
    methodRaw === "card" || methodRaw === "bit" || methodRaw === "cash"
      ? methodRaw
      : "cash";
  const url = on
    ? `/success?method=${encodeURIComponent(method)}&on=${encodeURIComponent(on)}&resume=1`
    : "/";

  let title = "Burger Hut";
  let body = "";
  if (event === "accepted") {
    title = "ההזמנה התקבלה";
    body =
      on && Number.isFinite(prepMins) && prepMins > 0
        ? `הזמנה #${on} בטיפול. זמן הכנה כ־${prepMins} דקות.`
        : on
          ? `הזמנה #${on} התקבלה ובהכנה.`
          : "ההזמנה התקבלה ובהכנה.";
  } else if (event === "rejected") {
    title = "ההזמנה נדחתה";
    body = on ? `הזמנה #${on} נדחתה.` : "ההזמנה נדחתה.";
  } else if (event === "ready") {
    title = "ההזמנה מוכנה";
    body = on ? `הזמנה #${on} מוכנה לאיסוף/מסירה.` : "ההזמנה מוכנה.";
  } else {
    title = "ההזמנה נמסרה";
    body = on ? `הזמנה #${on} סומנה כנמסרה. בתאבון!` : "ההזמנה סומנה כנמסרה.";
  }

  const payload = JSON.stringify({
    title,
    body,
    url,
    tag: `bh-order-status-${on || "x"}-${event}`,
    audience: "customer",
    sentAt: Date.now(),
  });

  try {
    await webpush.sendNotification(sub, payload, {
      TTL: 86400,
      urgency: "high",
    });
    return { ok: true, sent: 1 };
  } catch (e) {
    const status = Number(e?.statusCode);
    console.warn(
      "[customerPush] order status send failed",
      Number.isFinite(status) && status > 0 ? status : "?",
      e?.message || e
    );
    if (isStalePushSubscriptionError(status)) {
      await removeCustomerPushSubscriptionByEndpoint(sub?.endpoint);
    }
    return { ok: false, error: "send_failed" };
  }
}
