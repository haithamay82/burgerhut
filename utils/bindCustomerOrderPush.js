import {
  getOrCreateCustomerPushDeviceId,
  isValidPushClientId,
} from "@/utils/customerPushClientId";

/**
 * Link this device's customer push id to an order (best-effort).
 * @param {string|number} orderNumber
 */
export async function bindCustomerOrderPush(orderNumber) {
  if (typeof window === "undefined") return { ok: false };
  const on = String(orderNumber ?? "").trim();
  if (!/^\d{3,8}$/.test(on)) return { ok: false };
  let pushClientId = "";
  try {
    pushClientId = getOrCreateCustomerPushDeviceId();
  } catch {
    return { ok: false };
  }
  if (!isValidPushClientId(pushClientId)) return { ok: false };
  try {
    const r = await fetch("/api/orders/bind-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: on, pushClientId }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) return { ok: false, error: d.error };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
