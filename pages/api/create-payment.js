import { buildDoDealPaymentPageXml, parseDoDealPaymentPageResponse } from "@/lib/hypRelay";
import {
  getHypRelayEndpoint,
  getHypTerminal,
  getHypMerchantId,
  getHypRelayCredentials,
  listMissingHypEnvKeys,
  getKnownInvalidRelayHost,
} from "@/lib/hypConfig";
import { formatRelayFetchError } from "@/lib/relayFetchError";

const ORDER_DESCRIPTION = "Burger Hut order";

function getPublicOrigin(req) {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "";
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = (req.headers["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim();
  if (host) return `${proto}://${host}`;
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const relay = getHypRelayEndpoint();
  const terminal = getHypTerminal();
  const mid = getHypMerchantId();
  const auth = getHypRelayCredentials();

  if (!auth || !terminal || !mid || !relay) {
    return res.status(503).json({
      ok: false,
      error: "hyp_not_configured",
      missing: listMissingHypEnvKeys(),
      hint:
        "Set HYP_RELAY_BASE, HYP_TERMINAL, HYP_MERCHANT (or HYP_MID), and HYP_API_KEY / HYP_API_USER. See .env.example.",
    });
  }

  const badHost = getKnownInvalidRelayHost(relay);
  if (badHost) {
    return res.status(503).json({
      ok: false,
      error: "hyp_relay_host_invalid",
      host: badHost.host,
      hint:
        "This hostname is not registered in DNS. Replace HYP_RELAY_BASE with the exact API base URL Hyp sent you (cg-support@hyp.co.il).",
    });
  }

  const body = req.body || {};
  const totalAmount = Number(body.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return res.status(400).json({ ok: false, error: "invalid_total" });
  }

  const customerName =
    typeof body.customerName === "string" ? body.customerName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  const uniqueid =
    typeof body.uniqueId === "string" && body.uniqueId.trim()
      ? body.uniqueId.trim().slice(0, 64)
      : crypto.randomUUID();

  const origin = getPublicOrigin(req);
  if (!origin) {
    return res.status(503).json({
      ok: false,
      error: "missing_public_origin",
      hint:
        "Set NEXT_PUBLIC_SITE_URL (or SITE_URL) so success/cancel URLs are valid on Vercel.",
    });
  }

  const orderNum =
    body.orderNumber !== undefined && body.orderNumber !== null
      ? String(body.orderNumber).trim()
      : "";
  const onQ = orderNum ? `?on=${encodeURIComponent(orderNum)}` : "";

  const successUrl = `${origin}/success${onQ}`;
  const cancelUrl = `${origin}/cancel`;
  const errorUrl = `${origin}/payment-error`;

  const lang =
    body.language === "ENG" || body.language === "HEB"
      ? body.language
      : "HEB";

  const totalAgorot = Math.round(totalAmount * 100);
  const intIn = buildDoDealPaymentPageXml({
    terminalNumber: terminal,
    mid,
    uniqueid,
    totalAgorot,
    successUrl,
    errorUrl,
    cancelUrl,
    language: lang,
    customerName: [customerName, phone].filter(Boolean).join(" · "),
    orderDescription: ORDER_DESCRIPTION,
  });

  const formBody = new URLSearchParams({
    user: auth.user,
    password: auth.password,
    int_in: intIn,
  });

  let relayRes;
  try {
    relayRes = await fetch(relay, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
    });
  } catch (e) {
    const detail = formatRelayFetchError(e);
    let hint =
      "Verify HYP_RELAY_BASE (https URL, correct sandbox vs production). Ensure this machine reaches the internet (firewall/VPN).";
    const d = detail.toLowerCase();
    if (d.includes("enotfound") || d.includes("eai_again")) {
      hint =
        "DNS cannot resolve the hostname in HYP_RELAY_BASE. The URL must be the exact test/production API base URL Hyp sent you by email — not a guessed name. (Example: sandbox.creditguard.co.il does not exist in DNS.) If unsure, ask Hyp: cg-support@hyp.co.il";
    }
    if (d.includes("cert") || d.includes("ssl") || d.includes("tls")) {
      hint +=
        " TLS/certificate issue — corporate proxy or wrong host; ask Hyp for the exact relay URL.";
    }
    if (d.includes("econnrefused") || d.includes("econnreset")) {
      hint +=
        " Connection refused/reset — wrong port/host or gateway blocking outbound HTTPS.";
    }
    if (d.includes("etimedout") || d.includes("timeout")) {
      hint += " Timeout — try again or check network path to the relay.";
    }
    return res.status(502).json({
      ok: false,
      error: "relay_unreachable",
      message: detail,
      hint,
    });
  }

  const xmlText = await relayRes.text();

  if (!relayRes.ok) {
    const preview = xmlText.replace(/\s+/g, " ").trim().slice(0, 280);
    return res.status(502).json({
      ok: false,
      error: "relay_http_error",
      httpStatus: relayRes.status,
      message: preview || `HTTP ${relayRes.status}`,
    });
  }

  const parsed = parseDoDealPaymentPageResponse(xmlText);
  if (!parsed.ok || !parsed.mpiHostedPageUrl) {
    const looksLikeXml = /<\s*ashrait/i.test(xmlText);
    const preview = looksLikeXml
      ? undefined
      : xmlText.replace(/\s+/g, " ").trim().slice(0, 280);
    return res.status(502).json({
      ok: false,
      error: "hyp_relay_error",
      hypResult: parsed.result,
      hypMessage: parsed.message,
      hypUserMessage: parsed.userMessage,
      bodyPreview: preview,
    });
  }

  return res.status(200).json({
    ok: true,
    payment_url: parsed.mpiHostedPageUrl,
    uniqueId: uniqueid,
  });
}
