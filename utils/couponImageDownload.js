/**
 * תמונת קופון לשמירה במכשיר: ניסיון DOM (html-to-image / html2canvas), גיבוי PNG מהשרת.
 * @param {HTMLElement | null} element
 * @param {string} [couponCode]
 */
export async function downloadCouponElementAsPng(element, couponCode) {
  if (typeof window === "undefined") return;

  const code = String(couponCode || "")
    .trim()
    .toUpperCase();
  if (!code) return;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (typeof navigator !== "undefined" &&
      navigator.platform === "MacIntel" &&
      navigator.maxTouchPoints > 1);
  const isTouchUx =
    isIOS ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) ||
    (typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches);

  const safe =
    String(couponCode || "BH").replace(/[^A-Za-z0-9]/g, "") || "BH";
  const filename = `coupon-${safe}.png`;

  async function decodeImagesInSubtree(el) {
    if (!el) return;
    const imgs = el.querySelectorAll("img");
    await Promise.all(
      Array.from(imgs).map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
              resolve();
              return;
            }
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          })
      )
    );
  }

  async function blobFromDomElement(el) {
    if (!el) return null;
    await decodeImagesInSubtree(el);
    try {
      const { toBlob } = await import("html-to-image");
      const b = await toBlob(el, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#0b1220",
      });
      if (b && b.size > 400) return b;
    } catch {
      /* fall through */
    }
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(el, {
        backgroundColor: "#0b1220",
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 20000,
        foreignObjectRendering: false,
      });
      const b = await new Promise((resolve) => {
        canvas.toBlob((x) => resolve(x), "image/png", 0.95);
      });
      if (b && b.size > 400) return b;
    } catch {
      /* fall through */
    }
    return null;
  }

  async function blobFromServer(c) {
    const r = await fetch(
      `/api/coupon/card-png?code=${encodeURIComponent(c)}`,
      { credentials: "same-origin" }
    );
    if (!r.ok) return null;
    const b = await r.blob();
    return b && b.size > 400 ? b : null;
  }

  let blob =
    element != null
      ? await blobFromDomElement(element).catch(() => null)
      : null;
  if (!blob) {
    blob = await blobFromServer(code).catch(() => null);
  }
  if (!blob) return;

  const file =
    typeof File !== "undefined"
      ? new File([blob], filename, { type: "image/png" })
      : null;

  if (
    file &&
    typeof navigator !== "undefined" &&
    navigator.share &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: filename,
      });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const closeOverlay = (root) => {
    root.remove();
    URL.revokeObjectURL(url);
  };

  if (isTouchUx) {
    const root = document.createElement("div");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;";
    const hint = document.createElement("p");
    hint.style.cssText =
      "color:#fbbf24;font-size:14px;font-weight:700;text-align:center;margin:0 0 12px;max-width:22rem;line-height:1.45;";
    hint.textContent = isIOS
      ? "לחיצה ארוכה על התמונה ↓ ואז «שמור לתמונות»"
      : "לחיצה ארוכה על התמונה ↓ — שמירה או שיתוף ל«תמונות»";
    const img = document.createElement("img");
    img.src = url;
    img.alt = filename;
    img.style.cssText =
      "max-width:100%;max-height:65vh;height:auto;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);touch-action:manipulation;";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "סגור";
    closeBtn.style.cssText =
      "margin-top:16px;padding:10px 24px;border-radius:9999px;border:1px solid #64748b;background:#1e293b;color:#e2e8f0;font-weight:600;";
    closeBtn.onclick = () => closeOverlay(root);
    root.onclick = (ev) => {
      if (ev.target === root) closeOverlay(root);
    };
    root.appendChild(hint);
    root.appendChild(img);
    root.appendChild(closeBtn);
    document.body.appendChild(root);
    return;
  }

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }
}
