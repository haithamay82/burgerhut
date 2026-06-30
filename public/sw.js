/**
 * PWA — רישום Service Worker (עדכונים / התקנה מהבית) + Web Push להזמנות חדשות.
 *
 * לא משתמשים ב-fetch handler: מטמון Vercel Blob דרך SW שבר תמונות בסליידר
 * (תגובות opaque, destination ריק ב-Edge, וכו'). תמונות Blob נטענות ישירות מהרשת.
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("bh-blob-media-"))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

const ADMIN_PUSH_MAX_AGE_MS = 15 * 60 * 1000;
const CUSTOMER_PUSH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isCustomerPushPayload(data) {
  return (
    data.audience === "customer" ||
    String(data.tag || "").startsWith("bh-customer")
  );
}

self.addEventListener("push", (event) => {
  let data = {
    title: "הזמנה חדשה — Burger Hut",
    body: "התקבלה הזמנה חדשה.",
    url: "/admin/orders",
    tag: "bh-order",
    sentAt: 0,
    audience: "admin",
  };
  try {
    if (event.data) {
      const j = event.data.json();
      if (j && typeof j === "object") {
        data = { ...data, ...j };
      }
    }
  } catch {
    /* keep defaults */
  }
  const customer = isCustomerPushPayload(data);
  const sentAt = Number(data.sentAt);
  const maxAge = customer ? CUSTOMER_PUSH_MAX_AGE_MS : ADMIN_PUSH_MAX_AGE_MS;
  if (
    Number.isFinite(sentAt) &&
    sentAt > 0 &&
    Date.now() - sentAt > maxAge
  ) {
    return;
  }
  const defaultUrl = customer ? "/" : "/admin/orders";
  const openUrl =
    typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//")
      ? data.url
      : defaultUrl;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logo-burger-hut.png",
      badge: "/logo-burger-hut.png",
      tag: String(data.tag || (customer ? "bh-customer" : "bh-order")),
      data: { url: openUrl },
      renotify: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const path =
    typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")
      ? raw
      : "/";
  const targetUrl = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
