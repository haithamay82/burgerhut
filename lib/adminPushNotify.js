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
    sentAt: Date.now(),
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
    sentAt: Date.now(),
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

/**
 * התראת מנהל/עובד כשלקוח ביטל הזמנת מזומן.
 * @param {{ orderNumber?: number|string }} p
 */
export async function broadcastCustomerCancelledOrderToAdmins(p) {
  const num = p?.orderNumber != null ? String(p.orderNumber).trim() : "";
  const body = num
    ? `הלקוח ביטל את הזמנה #${num}`
    : "הלקוח ביטל הזמנה";
  const payload = JSON.stringify({
    title: "הזמנה בוטלה — Burger Hut",
    body,
    url: "/admin/orders",
    tag: num ? `bh-order-cancel-${num}` : `bh-order-cancel-${Date.now()}`,
    sentAt: Date.now(),
  });
  const result = await broadcastAdminPushPayload(payload);
  if (!result.ok) {
    if (result.error === "vapid_not_configured") {
      console.warn("[adminPush] cancel notify skip: VAPID not configured");
    } else if (result.error === "no_subscriptions") {
      console.warn("[adminPush] cancel notify skip: no subscriptions");
    }
  }
}

/**
 * תזכורת Push אחת — הזמנות ממתינות לאישור יותר מ־2 דקות (מקבץ).
 * @param {{ orderNumbers?: Array<number|string> }} p
 */
export async function broadcastPendingAcceptReminderToAdmins(p) {
  const tr = getTranslator("he");
  const nums = (Array.isArray(p?.orderNumbers) ? p.orderNumbers : [])
    .map((n) => String(n ?? "").trim())
    .filter(Boolean);
  const title = tr("admin.pendingAcceptRemindTitle");
  let body;
  if (nums.length === 0) {
    body = tr("admin.pendingAcceptRemindBodyNoNum");
  } else if (nums.length === 1) {
    body = tr("admin.pendingAcceptRemindBodyOne").replace("{n}", nums[0]);
  } else {
    const listed = nums
      .slice(0, 8)
      .map((n) => `#${n}`)
      .join(", ");
    const extra =
      nums.length > 8
        ? tr("admin.pendingAcceptRemindBodyExtra").replace(
            "{c}",
            String(nums.length - 8)
          )
        : "";
    body = tr("admin.pendingAcceptRemindBodyMany")
      .replace("{c}", String(nums.length))
      .replace("{list}", `${listed}${extra}`);
  }
  const payload = JSON.stringify({
    title,
    body,
    url: "/admin/orders",
    // Stable tag so concurrent devices collapse into one notification tray entry.
    tag: "bh-order-pending-reminder",
    kind: "pending_accept_reminder",
    renotify: true,
    sentAt: Date.now(),
  });
  const result = await broadcastAdminPushPayload(payload);
  if (!result.ok) {
    if (result.error === "vapid_not_configured") {
      console.warn("[adminPush] pending reminder skip: VAPID not configured");
    } else if (result.error === "no_subscriptions") {
      console.warn("[adminPush] pending reminder skip: no subscriptions");
    }
  }
  return result;
}

/**
 * התראת מנהל כשעובד מדווח / מעדכן שעת כניסה ויציאה.
 * @param {{ employeeName?: string, employeeId?: string, start?: string, end?: string, dayKey?: string, isUpdate?: boolean }} p
 */
export async function broadcastEmployeeHoursToAdmins(p) {
  const name = String(p?.employeeName || "").trim() || "עובד";
  const start = String(p?.start || "").trim() || "—";
  const end = String(p?.end || "").trim() || "—";
  const dayKey = String(p?.dayKey || "").trim();
  const employeeId = String(p?.employeeId || "").trim();
  const isUpdate = Boolean(p?.isUpdate);
  const title = isUpdate
    ? "עדכון שעות עובד — Burger Hut"
    : "דיווח שעות עובד — Burger Hut";
  const body = `העובד ${name} נכנס בשעה ${start} ויצא בשעה ${end}`;
  const payload = JSON.stringify({
    title,
    body,
    url: "/admin/orders",
    tag:
      employeeId && dayKey
        ? `bh-emp-hours-${employeeId}-${dayKey}`
        : `bh-emp-hours-${Date.now()}`,
    sentAt: Date.now(),
  });

  const result = await broadcastAdminPushPayload(payload);
  if (!result.ok) {
    if (result.error === "vapid_not_configured") {
      console.warn("[adminPush] employee hours skip: VAPID not configured");
    } else if (result.error === "no_subscriptions") {
      console.warn("[adminPush] employee hours skip: no subscriptions");
    }
  }
  return result;
}
