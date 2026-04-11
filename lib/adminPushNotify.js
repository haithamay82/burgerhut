import webpush from "web-push";
import {
  listAdminPushSubscriptions,
  removeAdminPushSubscriptionByEndpoint,
} from "@/lib/adminPushSubscriptions";

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

/**
 * שליחת Web Push לכל המנויים (מנהלים) — אחרי הזמנה חדשה.
 * לא זורק חוץ. חייב להסתיים לפני סיום ה-handler ב-serverless (Vercel), אחרת השליחה נקטעת.
 * @param {{ orderNumber?: number|string }} p
 */
export async function broadcastNewOrderToAdmins(p) {
  if (!ensureWebPushConfigured()) {
    console.warn("[adminPush] skip: VAPID not configured");
    return;
  }
  const subs = await listAdminPushSubscriptions();
  if (!subs.length) {
    console.warn("[adminPush] skip: no subscriptions");
    return;
  }
  const num = p?.orderNumber != null ? String(p.orderNumber).trim() : "";
  const payload = JSON.stringify({
    title: "הזמנה חדשה — Burger Hut",
    body: num ? `התקבלה הזמנה מס׳ ${num}.` : "התקבלה הזמנה חדשה.",
    url: "/admin/orders",
    tag: num ? `bh-order-${num}` : `bh-order-${Date.now()}`,
  });

  const sendOne = async (sub) => {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 3600 });
    } catch (e) {
      const status = Number(e?.statusCode);
      const ep = String(sub?.endpoint || "").slice(0, 72);
      console.warn(
        "[adminPush] send failed",
        Number.isFinite(status) && status > 0 ? status : "?",
        e?.message || e,
        ep || "(no endpoint)"
      );
      if (status === 410 || status === 404) {
        await removeAdminPushSubscriptionByEndpoint(sub?.endpoint);
      }
    }
  };

  for (let i = 0; i < subs.length; i += PUSH_SEND_CONCURRENCY) {
    const chunk = subs.slice(i, i + PUSH_SEND_CONCURRENCY);
    await Promise.all(chunk.map((sub) => sendOne(sub)));
  }
}
