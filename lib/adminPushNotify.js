import webpush from "web-push";
import {
  listAdminPushSubscriptions,
  removeAdminPushSubscriptionByEndpoint,
} from "@/lib/adminPushSubscriptions";
import { getTranslator } from "@/utils/i18n";
import { formatIls } from "@/utils/cartMoney";
import { buildOrderItemsHeadlinesPlain } from "@/utils/whatsapp";
import { buildAdminKitchenPrepPlainSuffix } from "@/utils/adminKitchenPrepAppend";

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
const ADMIN_PUSH_BODY_MAX_CHARS = 3800;

/** @param {number} status */
export function isStalePushSubscriptionError(status) {
  return status === 404 || status === 410 || status === 401 || status === 403;
}

/**
 * @param {string} payload JSON
 * @returns {Promise<{ ok: true, sent: number, failed: number, removed: number } | { ok: false, error: string }>}
 */
async function broadcastAdminPushPayload(payload) {
  if (!ensureWebPushConfigured()) {
    return { ok: false, error: "vapid_not_configured" };
  }
  const subs = await listAdminPushSubscriptions();
  if (!subs.length) {
    return { ok: false, error: "no_subscriptions" };
  }

  let sent = 0;
  let failed = 0;
  let removed = 0;

  const sendOne = async (sub) => {
    try {
      await webpush.sendNotification(sub, payload, {
        TTL: 3600,
        urgency: "high",
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      const status = Number(e?.statusCode);
      const ep = String(sub?.endpoint || "").slice(0, 72);
      console.warn(
        "[adminPush] send failed",
        Number.isFinite(status) && status > 0 ? status : "?",
        e?.message || e,
        ep || "(no endpoint)"
      );
      if (isStalePushSubscriptionError(status)) {
        await removeAdminPushSubscriptionByEndpoint(sub?.endpoint);
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

/** @returns {Promise<{ ok: true, sent: number, failed: number, removed: number } | { ok: false, error: string }>} */
export async function sendAdminTestPush() {
  const payload = JSON.stringify({
    title: "בדיקת Push — Burger Hut",
    body: "אם קיבלתם את זה — ההתראות עובדות.",
    url: "/admin/orders",
    tag: `bh-push-test-${Date.now()}`,
  });
  return broadcastAdminPushPayload(payload);
}

/**
 * שליחת Web Push לכל המנויים (מנהלים) — אחרי הזמנה חדשה.
 * לא זורק חוץ. חייב להסתיים לפני סיום ה-handler ב-serverless (Vercel), אחרת השליחה נקטעת.
 * @param {{ orderNumber?: number|string, couponCode?: string, couponDiscountNis?: number|string, items?: unknown[] }} p
 */
export async function broadcastNewOrderToAdmins(p) {
  const tr = getTranslator("he");
  const num = p?.orderNumber != null ? String(p.orderNumber).trim() : "";
  const disc = Number(p?.couponDiscountNis);
  const code = String(p?.couponCode || "").trim().toUpperCase();
  let body = num
    ? tr("admin.newOrderNotifyBodyOne").replace("{n}", num)
    : tr("admin.newOrderNotifyBodyNoNum");
  if (Number.isFinite(disc) && disc > 0) {
    body += tr("admin.newOrderNotifyCouponDiscount").replace(
      "{amount}",
      formatIls(disc)
    );
  }
  if (code) {
    body += tr("admin.newOrderNotifyCouponCode").replace("{code}", code);
  }
  const itemsPlain =
    Array.isArray(p?.items) && p.items.length
      ? buildOrderItemsHeadlinesPlain(p.items, "he")
      : "";
  if (itemsPlain) {
    body += `\n\n${itemsPlain}`;
  }
  body += buildAdminKitchenPrepPlainSuffix(tr, p?.items, "he");
  if (body.length > ADMIN_PUSH_BODY_MAX_CHARS) {
    body = `${body.slice(0, ADMIN_PUSH_BODY_MAX_CHARS - 1)}…`;
  }
  const payload = JSON.stringify({
    title: "הזמנה חדשה — Burger Hut",
    body,
    url: "/admin/orders",
    tag: num ? `bh-order-${num}` : `bh-order-${Date.now()}`,
  });

  const result = await broadcastAdminPushPayload(payload);
  if (!result.ok) {
    if (result.error === "vapid_not_configured") {
      console.warn("[adminPush] skip: VAPID not configured");
    } else if (result.error === "no_subscriptions") {
      console.warn("[adminPush] skip: no subscriptions");
    }
  }
}
