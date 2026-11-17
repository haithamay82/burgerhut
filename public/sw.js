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

/** Align with web-push TTL (1h) so delayed delivery still shows */
const ADMIN_PUSH_MAX_AGE_MS = 60 * 60 * 1000;
const CUSTOMER_PUSH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isCustomerPushPayload(data) {
  const tag = String(data.tag || "");
  return (
    data.audience === "customer" ||
    tag.startsWith("bh-customer") ||
    tag.startsWith("bh-order-status-")
  );
}

function isAdminNewOrderPayload(data, tag) {
  if (data.kind === "new_order") return true;
  if (data.kind === "pending_accept_reminder") return false;
  return (
    tag.startsWith("bh-order-") &&
    !tag.startsWith("bh-order-pending-reminder") &&
    !tag.startsWith("bh-order-cancel-") &&
    !tag.startsWith("bh-emp-hours-")
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
    typeof data.url === "string" &&
    data.url.startsWith("/") &&
    !data.url.startsWith("//")
      ? data.url
      : defaultUrl;
  const tag = String(data.tag || (customer ? "bh-customer" : "bh-order"));
  const pendingRemind =
    data.kind === "pending_accept_reminder" ||
    tag.startsWith("bh-order-pending-reminder");
  const adminNewOrder = !customer && isAdminNewOrderPayload(data, tag);
  const vibrate =
    Array.isArray(data.vibrate) && data.vibrate.length
      ? data.vibrate
      : adminNewOrder || pendingRemind
        ? [300, 120, 300, 120, 500]
        : undefined;

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/logo-burger-hut.png",
        badge: "/logo-burger-hut.png",
        tag,
        data: { url: openUrl, kind: data.kind || "" },
        silent: false,
        renotify:
          customer ||
          pendingRemind ||
          adminNewOrder ||
          Boolean(data.renotify),
        requireInteraction:
          pendingRemind || adminNewOrder || Boolean(data.requireInteraction),
        ...(vibrate ? { vibrate } : {}),
      });
      if (adminNewOrder || pendingRemind) {
        const list = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of list) {
          try {
            client.postMessage({
              type: "bh-admin-pending-ring",
              kind: pendingRemind ? "reminder" : "new_order",
              url: openUrl,
            });
          } catch {
            /* ignore */
          }
        }
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  let path =
    typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")
      ? raw
      : "/admin/orders?kitchenRing=1";
  if (path.startsWith("/admin/orders") && !path.includes("kitchenRing=")) {
    path += path.includes("?") ? "&kitchenRing=1" : "?kitchenRing=1";
  }
  const targetUrl = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of list) {
        try {
          const href = String(client.url || "");
          if (href.startsWith(self.location.origin)) {
            if (client.focus) await client.focus();
            try {
              if (client.navigate) await client.navigate(targetUrl);
            } catch {
              /* ignore */
            }
            try {
              client.postMessage({
                type: "bh-admin-pending-ring",
                force: true,
              });
            } catch {
              /* ignore */
            }
            return;
          }
        } catch {
          /* ignore */
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of list) {
        try {
          client.postMessage({ type: "bh-admin-push-resubscribe" });
        } catch {
          /* ignore */
        }
      }
    })()
  );
});
