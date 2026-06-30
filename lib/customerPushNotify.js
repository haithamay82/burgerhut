import webpush from "web-push";
import {
  listCustomerPushSubscriptions,
  removeCustomerPushSubscriptionByEndpoint,
} from "@/lib/customerPushSubscriptions";
import { isStalePushSubscriptionError } from "@/lib/adminPushNotify";

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
