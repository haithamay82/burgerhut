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

/**
 * שליחת Web Push לכל המנויים (מנהלים) — אחרי הזמנה חדשה.
 * לא זורק חוץ — כשלים נבלעים בשקט.
 * @param {{ orderNumber?: number|string }} p
 */
export async function broadcastNewOrderToAdmins(p) {
  if (!ensureWebPushConfigured()) return;
  const subs = await listAdminPushSubscriptions();
  if (!subs.length) return;
  const num = p?.orderNumber != null ? String(p.orderNumber).trim() : "";
  const payload = JSON.stringify({
    title: "הזמנה חדשה — Burger Hut",
    body: num ? `התקבלה הזמנה מס׳ ${num}.` : "התקבלה הזמנה חדשה.",
    url: "/admin/orders",
    tag: num ? `bh-order-${num}` : `bh-order-${Date.now()}`,
  });
  await Promise.all(
    subs.map(async (sub) => {
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
    })
  );
}
