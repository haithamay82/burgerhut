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

self.addEventListener("push", (event) => {
  let data = {
    title: "הזמנה חדשה — Burger Hut",
    body: "התקבלה הזמנה חדשה.",
    url: "/admin/orders",
    tag: "bh-order",
    sentAt: 0,
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
  const sentAt = Number(data.sentAt);
  if (
    Number.isFinite(sentAt) &&
    sentAt > 0 &&
    Date.now() - sentAt > ADMIN_PUSH_MAX_AGE_MS
  ) {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logo-burger-hut.png",
      badge: "/logo-burger-hut.png",
      tag: String(data.tag || "bh-order"),
      data: { url: data.url || "/admin/orders" },
      renotify: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const path = typeof raw === "string" && raw.startsWith("/") ? raw : "/admin/orders";
  const targetUrl = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
