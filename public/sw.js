/**
 * PWA + מטמון מדיה מ-Vercel Blob: חוסך תעבורת Blob בכניסות חוזרות (תמונות בעיקר).
 * בקשות Range (נפוץ בווידאו) עוברות ישירות לרשת — לא שומרים חלקי 206 ב-cache.
 */
const BLOB_CACHE = "bh-blob-media-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("bh-blob-media-") && k !== BLOB_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isVercelBlobHost(hostname) {
  return (
    hostname.endsWith(".public.blob.vercel-storage.com") ||
    hostname.endsWith(".blob.vercel-storage.com")
  );
}

async function cacheFirstBlob(request) {
  const cache = await caches.open(BLOB_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cacheable =
    response &&
    (response.ok || response.type === "opaque") &&
    response.status !== 206;

  if (cacheable) {
    try {
      await cache.put(request, response.clone());
    } catch {
      /* מכסת אחסון / תגובה שלא ניתנת לשמירה */
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    event.respondWith(fetch(request));
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    event.respondWith(fetch(request));
    return;
  }

  if (!isVercelBlobHost(url.hostname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.headers.has("range")) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(cacheFirstBlob(request));
});
