/**
 * מצלם אלמנט DOM (כרטיס קופון) ל־PNG ומפעיל הורדה — כמו ב־CouponCard.
 * @param {HTMLElement | null} element
 * @param {string} [couponCode]
 */
export async function downloadCouponElementAsPng(element, couponCode) {
  if (typeof window === "undefined" || !element) return;
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, {
    backgroundColor: "#0b1220",
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
  });
  const dataUrl = canvas.toDataURL("image/png");
  const safe =
    String(couponCode || "BH").replace(/[^A-Za-z0-9]/g, "") || "BH";
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `coupon-${safe}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
