/**
 * PWA — רישום Service Worker (עדכונים / התקנה מהבית).
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
