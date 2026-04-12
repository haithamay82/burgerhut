/**
 * מצלם אלמנט DOM (כרטיס קופון) ל־PNG — שיתוף/שמירה במובייל, הורדה בדסקטופ.
 * @param {HTMLElement | null} element
 * @param {string} [couponCode]
 */
export async function downloadCouponElementAsPng(element, couponCode) {
  if (typeof window === "undefined" || !element) return;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (typeof navigator !== "undefined" &&
      navigator.platform === "MacIntel" &&
      navigator.maxTouchPoints > 1);

  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, {
    backgroundColor: "#0b1220",
    scale:
      typeof window !== "undefined" && window.devicePixelRatio >= 2 ? 1.75 : 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    imageTimeout: 20000,
    foreignObjectRendering: false,
  });

  const safe =
    String(couponCode || "BH").replace(/[^A-Za-z0-9]/g, "") || "BH";
  const filename = `coupon-${safe}.png`;

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 0.95);
  });
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
  const revokeLater = () => {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  };

  if (isIOS) {
    const root = document.createElement("div");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;";
    const hint = document.createElement("p");
    hint.style.cssText =
      "color:#fbbf24;font-size:14px;font-weight:700;text-align:center;margin:0 0 12px;max-width:20rem;line-height:1.4;";
    hint.textContent =
      "לחיצה ארוכה על התמונה ↓ ואז «שמור לתמונות»";
    const img = document.createElement("img");
    img.src = url;
    img.alt = filename;
    img.style.cssText =
      "max-width:100%;max-height:70vh;height:auto;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "סגור";
    closeBtn.style.cssText =
      "margin-top:16px;padding:10px 24px;border-radius:9999px;border:1px solid #64748b;background:#1e293b;color:#e2e8f0;font-weight:600;";
    const close = () => {
      root.remove();
      URL.revokeObjectURL(url);
    };
    closeBtn.onclick = close;
    root.onclick = (ev) => {
      if (ev.target === root) close();
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
    revokeLater();
  }
}
