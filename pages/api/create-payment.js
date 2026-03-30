import {
  getHypEnvDebugSnapshot,
  shouldLogHypEnvDebug,
  getHypPayBase,
  getHypMasofForPay,
  getHypApiKey,
  getHypPayPassP,
  validateHypPayEnv,
} from "@/lib/hypConfig";
import { buildApiSignUrl, parseApiSignResponse } from "@/lib/hypPayProtocol";
import { formatFetchErrorDetail } from "@/lib/fetchErrorDetail";

const ORDER_DESCRIPTION = "Burger Hut order";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (shouldLogHypEnvDebug()) {
    console.log(
      "[api/create-payment] HYP env snapshot:",
      JSON.stringify(getHypEnvDebugSnapshot(), null, 2)
    );
  }

  const env = validateHypPayEnv();
  if (!env.ok) {
    if (env.error === "hyp_api_key_invalid") {
      return res.status(503).json({
        ok: false,
        error: "hyp_api_key_invalid",
        reason: env.reason,
        hint: "Use the API KEY from Hyp Pay → Terminal Settings only.",
      });
    }
    return res.status(503).json({
      ok: false,
      error: "hyp_not_configured",
      missing: env.missing,
      hint:
        "Hyp Pay Protocol: set HYP_API_KEY, HYP_TERMINAL (Masof), and HYP_PASSP (or HYP_MERCHANT if PassP is stored there). See .env.example.",
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

  const orderNum =
    body.orderNumber !== undefined && body.orderNumber !== null
      ? String(body.orderNumber).trim()
      : "";

  const lang =
    body.language === "ENG" || body.language === "HEB"
      ? body.language
      : "HEB";

  const infoBits = [ORDER_DESCRIPTION, orderNum ? `#${orderNum}` : ""]
    .filter(Boolean)
    .join(" ");

  const apiSignUrl = buildApiSignUrl({
    host: getHypPayBase(),
    masof: getHypMasofForPay(),
    key: getHypApiKey(),
    passP: getHypPayPassP(),
    order: uniqueid,
    info: infoBits || ORDER_DESCRIPTION,
    amountNis: totalAmount,
    pageLang: lang,
    customerName:
      [customerName, phone].filter(Boolean).join(" ") || customerName,
    phone,
  });

  let payRes;
  try {
    payRes = await fetch(apiSignUrl, {
      method: "GET",
      headers: { Accept: "text/plain,text/html,*/*" },
    });
  } catch (e) {
    const detail = formatFetchErrorDetail(e);
    let hint =
      "Check outbound HTTPS to Hyp Pay (pay.hyp.co.il) and HYP_PAY_BASE if customized.";
    const d = detail.toLowerCase();
    if (d.includes("enotfound") || d.includes("eai_again")) {
      hint =
        "DNS error reaching Hyp Pay — verify network/HYP_PAY_BASE and that the host resolves.";
    }
    return res.status(502).json({
      ok: false,
      error: "hyp_pay_unreachable",
      message: detail,
      hint,
    });
  }

  const payText = await payRes.text();
  if (!payRes.ok) {
    const preview = payText.replace(/\s+/g, " ").trim().slice(0, 280);
    return res.status(502).json({
      ok: false,
      error: "hyp_pay_http_error",
      httpStatus: payRes.status,
      message: preview || `HTTP ${payRes.status}`,
    });
  }

  const payParsed = parseApiSignResponse(payText, getHypPayBase());
  if (!payParsed.ok || !payParsed.payUrl) {
    return res.status(502).json({
      ok: false,
      error: "hyp_apisign_error",
      message: payParsed.message,
    });
  }

  return res.status(200).json({
    ok: true,
    payment_url: payParsed.payUrl,
    uniqueId: uniqueid,
  });
}
