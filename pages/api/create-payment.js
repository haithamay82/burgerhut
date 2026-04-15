import {
  getHypEnvDebugSnapshot,
  shouldLogHypEnvDebug,
  shouldLogHypDevRequestDetails,
  getHypPayBase,
  getHypMasofForPay,
  getHypApiKey,
  getHypPayPassP,
  validateHypPayEnv,
  resolveHypIntegrationMode,
  getHypSafeDebugSnapshot,
} from "@/lib/hypConfig";
import {
  buildApiSignUrl,
  parseApiSignResponse,
  describeApiSignRequestForLog,
  payProtocolSignFieldPresence,
  buildInvoiceHeshDesc,
  buildPritimHeshDescFromOrderDetails,
  computeInvoiceDeliveryPrefs,
  sanitizeHypInvoiceEmail,
  normalizeIsraeliCellForHyp,
} from "@/lib/hypPayProtocol";
import { formatFetchErrorDetail } from "@/lib/fetchErrorDetail";

const ORDER_DESCRIPTION = "Burger Hut order";

/** הסרת ערך signature מהלוג — לא לחשוף טוקן חתימה */
function redactHypResponseForLog(text) {
  return String(text ?? "")
    .replace(/(^|[&?])signature=[^&]*/gi, "$1signature=[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
}

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

  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName =
    typeof body.lastName === "string" ? body.lastName.trim() : "";
  const customerName =
    typeof body.customerName === "string" ? body.customerName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const emailRaw =
    typeof body.email === "string"
      ? body.email.trim()
      : typeof body.customerEmail === "string"
        ? body.customerEmail.trim()
        : "";

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

  const displayName =
    firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(" ")
      : customerName;

  const invPrefs = computeInvoiceDeliveryPrefs({
    email: emailRaw,
    phone,
  });
  const orderDetails = Array.isArray(body.orderDetails) ? body.orderDetails : [];
  const pritimPack = buildPritimHeshDescFromOrderDetails(
    orderDetails,
    totalAmount
  );
  let heshDesc;
  let pritim = false;
  if (pritimPack.ok && pritimPack.heshDesc) {
    heshDesc = pritimPack.heshDesc;
    pritim = true;
  } else {
    heshDesc = buildInvoiceHeshDesc({
      orderNumber: orderNum,
      amountNis: totalAmount,
    });
    pritim = false;
  }

  const signOpts = {
    host: getHypPayBase(),
    masof: getHypMasofForPay(),
    key: getHypApiKey(),
    passP: getHypPayPassP(),
    order: uniqueid,
    info: infoBits || ORDER_DESCRIPTION,
    amountNis: totalAmount,
    pageLang: lang,
    clientFirstName: firstName,
    clientLastName: lastName,
    customerName: displayName,
    phone,
    customerEmail: emailRaw,
    invoiceEmail: invPrefs.sendEmailInvoice,
    invoiceSms: invPrefs.sendSmsInvoice,
    heshDesc,
    pritim,
  };

  const apiSignUrl = buildApiSignUrl(signOpts);

  if (process.env.NODE_ENV === "development") {
    console.log("[api/create-payment] invoice routing (no PII):", {
      SendHesh: invPrefs.sendEmailInvoice,
      sendHeshSMS: invPrefs.sendSmsInvoice,
      hasEmail: Boolean(sanitizeHypInvoiceEmail(emailRaw)),
      hasCell: normalizeIsraeliCellForHyp(phone).ok,
    });
  }

  if (shouldLogHypDevRequestDetails()) {
    console.log(
      "[api/create-payment][dev] integration:",
      resolveHypIntegrationMode(),
      "(Pay Protocol APISign GET — not Relay /xpo/Relay)"
    );
    console.log(
      "[api/create-payment][dev] safe env snapshot:",
      JSON.stringify(getHypSafeDebugSnapshot(), null, 2)
    );
    console.log(
      "[api/create-payment][dev] field presence:",
      JSON.stringify(payProtocolSignFieldPresence(signOpts), null, 2)
    );
    console.log(
      "[api/create-payment][dev] outbound APISign:",
      JSON.stringify(describeApiSignRequestForLog(apiSignUrl), null, 2)
    );
    console.log(
      "[api/create-payment][dev] invoice flags (no PII):",
      JSON.stringify(
        {
          SendHesh: invPrefs.sendEmailInvoice,
          sendHeshSMS: invPrefs.sendSmsInvoice,
          hasEmail: Boolean(sanitizeHypInvoiceEmail(emailRaw)),
          hasCell: normalizeIsraeliCellForHyp(phone).ok,
        },
        null,
        2
      )
    );
  }

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

  if (process.env.NODE_ENV === "development") {
    console.log("=== HYP RESPONSE DEBUG ===");
    console.log("httpStatus:", payRes.status, payRes.ok ? "ok" : "not ok");
    console.log("raw response:", redactHypResponseForLog(payText));

    const cleaned = String(payText ?? "").trim().replace(/^\?/, "");
    const sp = new URLSearchParams(cleaned);
    const hasSignature = Boolean(sp.get("signature"));
    const cCode = sp.get("CCode") || sp.get("ccode");
    const errMsg =
      sp.get("errMsg") || sp.get("error") || sp.get("message") || null;

    console.log("CCode:", cCode ?? "(none)");
    console.log("errMsg:", errMsg ?? "(none)");
    console.log("signature:", hasSignature ? "present" : "missing");

    if (!hasSignature) {
      console.log("❌ HYP did not return signature — APISign failed");
    }
    console.log("=== HYP RESPONSE DEBUG END ===");
  }

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
