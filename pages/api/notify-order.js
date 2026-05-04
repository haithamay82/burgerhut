import { buildWhatsAppOrderText } from "@/utils/whatsapp";

const DEFAULT_TO = "972504847599";

function sumOrderTotal(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, i) => {
    const q = Number(i.quantity) || 0;
    const p = Number(i.price) || 0;
    return s + p * q;
  }, 0);
}

/**
 * Direct WhatsApp delivery (no client composer) requires Meta WhatsApp Cloud API
 * on a Business phone number. Set:
 *   WHATSAPP_CLOUD_ACCESS_TOKEN (or WHATSAPP_ACCESS_TOKEN)
 *   WHATSAPP_PHONE_NUMBER_ID
 *   WHATSAPP_ORDER_NOTIFY_E164 (optional, default 972504847599)
 *
 * For free-text messages, the store’s number must be able to receive them per Meta rules
 * (often you need an open 24h session or an approved template — see Meta docs).
 *
 * Dev fallback: WHATSAPP_ALLOW_WA_ME_FALLBACK=true → API returns allowFallback so the
 * client may open wa.me (user can still edit there).
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { customer, items, payment, locale } = req.body || {};

  if (!customer || typeof customer !== "object") {
    return res.status(400).json({ ok: false, error: "invalid_customer" });
  }
  if (!customer.name || !customer.phone) {
    return res.status(400).json({ ok: false, error: "missing_customer_fields" });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ ok: false, error: "empty_cart" });
  }

  const total = sumOrderTotal(items);
  const text = buildWhatsAppOrderText({
    customer,
    cart: { items },
    total,
    payment: payment || "cash",
    locale: locale === "he" ? "he" : "ar",
  });

  const token =
    process.env.WHATSAPP_CLOUD_ACCESS_TOKEN ||
    process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const toRaw =
    process.env.WHATSAPP_ORDER_NOTIFY_E164 || DEFAULT_TO;
  const to = String(toRaw).replace(/^\+/, "");

  if (!token || !phoneNumberId) {
    const allowFallback =
      process.env.WHATSAPP_ALLOW_WA_ME_FALLBACK === "true";
    return res.status(501).json({
      ok: false,
      configured: false,
      allowFallback,
      hint:
        "Set WHATSAPP_CLOUD_ACCESS_TOKEN (or WHATSAPP_ACCESS_TOKEN) and WHATSAPP_PHONE_NUMBER_ID for server-side WhatsApp.",
    });
  }

  const version = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  try {
    const graphRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    const graphData = await graphRes.json().catch(() => ({}));

    if (!graphRes.ok) {
      return res.status(502).json({
        ok: false,
        error: "whatsapp_graph_error",
        details: graphData,
      });
    }

    return res.status(200).json({ ok: true, graph: graphData });
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: "network_error",
      message: e instanceof Error ? e.message : "unknown",
    });
  }
}
