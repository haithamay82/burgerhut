/**
 * Hyp Pay Protocol — hosted payment page (APISign → redirect URL).
 * @see hypay.apib (Pay Protocol), HOST https://pay.hyp.co.il/p/
 */

/** @param {string|undefined} raw */
export function normalizeMasof(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 10) return digits.slice(0, 10);
  return digits.padStart(10, "0");
}

/** NIS amount for Pay Protocol ( Amount parameter — shekels, not agorot ) */
export function formatHypPayAmountNis(totalNis) {
  const x = Number(totalNis);
  if (!Number.isFinite(x) || x <= 0) return "";
  const s = x.toFixed(2).replace(/\.?0+$/, "");
  return s === "" ? "0" : s;
}

const HESH_DESC_MAX = 480;

/**
 * אימייל לפרמטר email ב־YaadPay — ללא אימות מלא; חותך אורך.
 * @returns {string} מחרוזת ריקה אם לא מתאים לשימוש
 */
export function sanitizeHypInvoiceEmail(raw) {
  const s = String(raw ?? "").trim().slice(0, 120);
  if (!s || !s.includes("@")) return "";
  return s;
}

/**
 * נורמליזציה בטוחה למספר ישראלי לשדה cell (ספרות בלבד, 9–10 ספרות, מתחיל ב־0).
 * @returns {{ ok: boolean, cell: string }}
 */
export function normalizeIsraeliCellForHyp(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return { ok: false, cell: "" };
  if (digits.startsWith("972")) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.startsWith("00972")) {
    digits = `0${digits.slice(5)}`;
  }
  if (digits.length === 9 && digits.startsWith("5")) {
    digits = `0${digits}`;
  }
  if (digits.length < 9 || digits.length > 10) {
    return { ok: false, cell: "" };
  }
  if (!digits.startsWith("0")) {
    return { ok: false, cell: "" };
  }
  return { ok: true, cell: digits };
}

/**
 * החלטות שליחת חשבונית (מייל / SMS) — ללא סודות.
 * @param {{ email?: string, phone?: string }} p
 * @returns {{ sendEmailInvoice: boolean, sendSmsInvoice: boolean }}
 */
export function computeInvoiceDeliveryPrefs(p) {
  const sendEmailInvoice = Boolean(sanitizeHypInvoiceEmail(p?.email));
  const sendSmsInvoice = normalizeIsraeliCellForHyp(p?.phone).ok;
  return { sendEmailInvoice, sendSmsInvoice };
}

/**
 * תיאור חשבונית כטקסט חופשי (בלי Pritim) — ASCII בלבד כדי למנוע תווי ? בחשבונית Yaad.
 * @param {{ amountNis?: number }} p
 */
export function buildInvoiceHeshDesc(p) {
  const amt = Number(p?.amountNis);
  const amtStr =
    Number.isFinite(amt) && amt > 0 ? `${formatHypPayAmountNis(amt)} ILS` : "";
  const base = "burger hut order";
  const out = amtStr ? `${base} ${amtStr}` : base;
  return out.slice(0, HESH_DESC_MAX);
}

function round2(x) {
  return Math.round(Number(x) * 100) / 100;
}

const YAAD_LABEL_MAX = 72;

/**
 * תווים אסורים בפורמט Yaad ~ [ ] ; מנקה תווים שגורמים לעיתים לקידוד שבור בחשבונית.
 */
export function sanitizeYaadPritimLabel(raw) {
  let s = String(raw ?? "")
    .replace(/[\[\]~]/g, " ")
    .replace(/\u05F3/g, "'")
    .replace(/\u05F4/g, '"')
    .replace(/[\u200E\u200F\u202A-\u202E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > YAAD_LABEL_MAX) s = s.slice(0, YAAD_LABEL_MAX).trim();
  return s || "Item";
}

/**
 * @param {Record<string, unknown>} row שורה מ־buildCardOrderDetailsFromItems
 */
function buildOrderDetailLabelFromRow(row) {
  const parts = [];
  if (row?.name) parts.push(String(row.name).trim());
  if (row?.sizeLabel) parts.push(String(row.sizeLabel).trim());
  if (row?.variantLabel) parts.push(String(row.variantLabel).trim());
  if (row?.mealFriesLabel) {
    parts.push(String(row.mealFriesLabel).trim());
  }
  if (row?.requestedDrinkLabel) {
    parts.push(String(row.requestedDrinkLabel).trim());
  }
  for (const key of ["toppings", "salads", "extras"]) {
    const arr = row?.[key];
    if (Array.isArray(arr) && arr.length) {
      const joined = arr
        .slice(0, 6)
        .map((x) => String(x).trim())
        .filter(Boolean)
        .join(", ");
      if (joined) parts.push(joined);
    }
  }
  return sanitizeYaadPritimLabel(parts.join(" · "));
}

function scaleLineTotalsToTarget(lineTotals, target) {
  const sum = round2(lineTotals.reduce((a, b) => a + b, 0));
  const t = round2(target);
  if (sum <= 0 || t <= 0) return lineTotals.map(() => 0);
  if (Math.abs(sum - t) <= 0.01) return lineTotals.map((x) => round2(x));
  const out = lineTotals.map((lt) => round2((lt * t) / sum));
  let drift = round2(t - out.reduce((a, b) => a + b, 0));
  let guard = 0;
  let idx = out.length - 1;
  const step = drift > 0 ? 0.01 : -0.01;
  while (Math.abs(drift) >= 0.005 && guard < 10000) {
    out[idx] = round2(out[idx] + step);
    drift = round2(drift - step);
    idx -= 1;
    if (idx < 0) idx = out.length - 1;
    guard += 1;
  }
  return out;
}

function sumPritimLinesAmount(heshDesc) {
  const re = /\[(\d+)~([^~]*)~(\d+)~([\d.]+)\]/g;
  let sum = 0;
  let m;
  const s = String(heshDesc ?? "");
  while ((m = re.exec(s)) !== null) {
    const qty = Number(m[3]);
    const unit = Number(m[4]);
    if (Number.isFinite(qty) && Number.isFinite(unit)) {
      sum = round2(sum + qty * unit);
    }
  }
  return sum;
}

/**
 * heshDesc בפורמט YaadPay עם Pritim: [0~תיאור~כמות~מחיר ליחידה כולל מע"מ]...
 * מתאים את סכום השורות ל־chargeAmountNis (הנחות/קופון וכו').
 * @param {unknown[]} orderDetails
 * @param {number} chargeAmountNis
 * @returns {{ ok: boolean, heshDesc: string }}
 */
export function buildPritimHeshDescFromOrderDetails(orderDetails, chargeAmountNis) {
  const target = round2(Number(chargeAmountNis));
  if (!Array.isArray(orderDetails) || orderDetails.length === 0 || !(target > 0)) {
    return { ok: false, heshDesc: "" };
  }
  /** @type {{ qty: number, lineTotal: number, label: string }[]} */
  const rows = [];
  for (const row of orderDetails) {
    if (!row || typeof row !== "object") continue;
    const qty = Math.max(1, Math.floor(Number(row.quantity) || 1));
    const lt = round2(Number(row.lineTotal) || 0);
    if (!(lt > 0)) continue;
    rows.push({
      qty,
      lineTotal: lt,
      label: buildOrderDetailLabelFromRow(row),
    });
  }
  if (!rows.length) return { ok: false, heshDesc: "" };

  const sumLines = round2(rows.reduce((s, r) => s + r.lineTotal, 0));
  if (sumLines <= 0) return { ok: false, heshDesc: "" };

  const alloc = scaleLineTotalsToTarget(
    rows.map((r) => r.lineTotal),
    target
  );

  const segments = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const a = round2(alloc[i] ?? 0);
    if (!(a > 0)) continue;
    const unit = round2(a / r.qty);
    const unitStr = formatHypPayAmountNis(unit);
    if (!unitStr) continue;
    segments.push(`[0~${r.label}~${r.qty}~${unitStr}]`);
  }

  let heshDesc = segments.join("");
  const sumOk = (s) => Math.abs(sumPritimLinesAmount(s) - target) <= 0.02;
  if (heshDesc.length > HESH_DESC_MAX || !sumOk(heshDesc)) {
    const mergedLabel = sanitizeYaadPritimLabel(
      rows.map((r) => r.label).join(" + ")
    );
    heshDesc = `[0~${mergedLabel}~1~${formatHypPayAmountNis(target)}]`;
  }
  if (!sumOk(heshDesc)) {
    heshDesc = `[0~burger hut order~1~${formatHypPayAmountNis(target)}]`;
  }
  if (!sumOk(heshDesc)) {
    return { ok: false, heshDesc: "" };
  }
  return { ok: true, heshDesc };
}

function splitClientName(full) {
  const t = String(full ?? "").trim();
  if (!t) return { clientName: "Customer", clientLName: "" };
  const parts = t.split(/\s+/);
  return {
    clientName: parts[0]?.slice(0, 48) || "Customer",
    clientLName: parts.slice(1).join(" ").slice(0, 48),
  };
}

/** @param {{ customerName?: string, clientFirstName?: string, clientLastName?: string }} opts */
function resolveClientNames(opts) {
  const fn = String(opts.clientFirstName ?? "").trim();
  const ln = String(opts.clientLastName ?? "").trim();
  if (fn || ln) {
    return {
      clientName: (fn.slice(0, 48) || "Customer"),
      clientLName: ln.slice(0, 48),
    };
  }
  return splitClientName(opts.customerName);
}

/**
 * @param {{
 *   host: string,
 *   masof: string,
 *   key: string,
 *   passP: string,
 *   order: string,
 *   info: string,
 *   amountNis: number,
 *   pageLang: 'HEB' | 'ENG',
 *   customerName: string,
 *   clientFirstName?: string,
 *   clientLastName?: string,
 *   phone: string,
 *   customerEmail?: string,
 *   invoiceEmail?: boolean,
 *   invoiceSms?: boolean,
 *   heshDesc?: string,
 *   pritim?: boolean,
 * }} opts
 */
export function buildApiSignUrl(opts) {
  const host = opts.host.replace(/\/?$/, "/");
  const u = new URL(host);
  const amountStr = formatHypPayAmountNis(opts.amountNis);
  const { clientName, clientLName } = resolveClientNames(opts);
  const normCell = normalizeIsraeliCellForHyp(opts.phone);
  const cell = normCell.ok
    ? normCell.cell
    : String(opts.phone ?? "")
        .replace(/\D/g, "")
        .slice(0, 20);

  const emailForInvoice = sanitizeHypInvoiceEmail(opts.customerEmail);
  const wantEmailInvoice = Boolean(opts.invoiceEmail && emailForInvoice);
  const wantSmsInvoice = Boolean(opts.invoiceSms && normCell.ok);

  const params = new URLSearchParams();
  params.set("action", "APISign");
  params.set("What", "SIGN");
  params.set("KEY", opts.key);
  params.set("PassP", opts.passP);
  params.set("Masof", opts.masof);
  params.set("Order", opts.order);
  params.set("Info", opts.info.slice(0, 200));
  params.set("Amount", amountStr);
  params.set("UTF8", "True");
  params.set("UTF8out", "True");
  params.set("Sign", "True");
  params.set("MoreData", "True");
  params.set("pageTimeOut", "True");
  params.set("Coin", "1");
  params.set("PageLang", opts.pageLang === "ENG" ? "ENG" : "HEB");
  params.set("UserId", "000000000");
  params.set("ClientName", clientName);
  if (clientLName) params.set("ClientLName", clientLName);
  if (cell) params.set("cell", cell);

  if (wantEmailInvoice) {
    params.set("SendHesh", "True");
    params.set("sendemail", "True");
    params.set("email", emailForInvoice);
  }
  if (wantSmsInvoice) {
    params.set("sendHeshSMS", "True");
  }
  const includeHeshDesc =
    (wantEmailInvoice || wantSmsInvoice || opts.pritim) && opts.heshDesc;
  if (includeHeshDesc) {
    const hd = String(opts.heshDesc).trim().slice(0, HESH_DESC_MAX);
    if (hd) params.set("heshDesc", hd);
  }
  if (opts.pritim && opts.heshDesc) {
    params.set("Pritim", "True");
  }

  u.search = params.toString();
  return u.toString();
}

/**
 * @param {string} text Response body from APISign (application/x-www-form-urlencoded)
 * @param {string} [payPageBase] e.g. https://pay.hyp.co.il/p/ — שיווי ל־HYP_PAY_BASE אם הוגדר
 * @returns {{ ok: boolean, message?: string, payUrl?: string, params?: URLSearchParams }}
 */
export function parseApiSignResponse(text, payPageBase) {
  const raw = String(text ?? "").trim();
  if (!raw) return { ok: false, message: "empty_response" };
  const cleaned = raw.replace(/^\?/, "");
  const sp = new URLSearchParams(cleaned);
  const signature = sp.get("signature");
  if (signature) {
    const base = (payPageBase || "https://pay.hyp.co.il/p").replace(/\/?$/, "/");
    const pay = new URL(base);
    for (const [k, v] of sp.entries()) {
      pay.searchParams.append(k, v);
    }
    return { ok: true, payUrl: pay.toString(), params: sp };
  }
  const err =
    sp.get("errMsg") ||
    sp.get("error") ||
    sp.get("message") ||
    (raw.length > 400 ? `${raw.slice(0, 400)}…` : raw);
  return { ok: false, message: err || "apisign_rejected", params: sp };
}

const APISIGN_SENSITIVE_KEYS = new Set(["KEY", "PassP", "passp", "key"]);

function maskCell(value) {
  const d = String(value ?? "").replace(/\D/g, "");
  if (d.length <= 4) return d ? "[phone:redacted]" : "";
  return `${d.slice(0, 3)}…${d.slice(-2)}`;
}

/**
 * תיאור בטוח של בקשת GET ל-APISign (ללא סודות).
 * @param {string} fullUrl
 */
export function describeApiSignRequestForLog(fullUrl) {
  let u;
  try {
    u = new URL(fullUrl);
  } catch {
    return {
      integration: "hyp_pay_protocol",
      parseError: true,
      rawLength: String(fullUrl ?? "").length,
    };
  }
  const safeParams = {};
  const keys = [];
  for (const [k, v] of u.searchParams.entries()) {
    keys.push(k);
    if (APISIGN_SENSITIVE_KEYS.has(k)) {
      safeParams[k] = v ? "[REDACTED]" : "";
    } else if (k === "cell") {
      safeParams[k] = maskCell(v);
    } else if (k === "email") {
      safeParams[k] = v ? "[email:redacted]" : "";
    } else if (
      k === "SendHesh" ||
      k === "sendHeshSMS" ||
      k === "sendemail" ||
      k === "Pritim"
    ) {
      safeParams[k] = v;
    } else if (k === "heshDesc") {
      safeParams[k] = v ? `[heshDesc len ${String(v).length}]` : "";
    } else if (k === "Masof") {
      const d = String(v ?? "").replace(/\D/g, "");
      safeParams[k] = d.length >= 4 ? `…${d.slice(-4)}` : d ? "[masof:short]" : "";
    } else if (k === "ClientName" || k === "ClientLName") {
      safeParams[k] = v ? "[name:redacted]" : "";
    } else {
      safeParams[k] = v;
    }
  }
  const masof = u.searchParams.get("Masof") || "";
  return {
    integration: "hyp_pay_protocol",
    endpoint: `${u.protocol}//${u.hostname}${u.pathname}`,
    httpMethod: "GET",
    queryParamNames: keys,
    queryParamsSafe: safeParams,
    masofPresent: Boolean(masof),
    masofLast4: masof.replace(/\D/g, "").slice(-4) || null,
    amountParam: u.searchParams.get("Amount") || null,
    orderParam: u.searchParams.get("Order")
      ? `[len ${u.searchParams.get("Order")?.length}]`
      : null,
    coin: u.searchParams.get("Coin") || null,
    pageLang: u.searchParams.get("PageLang") || null,
    /** בניית APISign הנוכחית אינה שולחת success/fail URL — בדרך כלל בפרופיל המסוף בפורטל Hyp */
    successUrlInThisRequest: false,
    failUrlInThisRequest: false,
  };
}

/**
 * נוכחות שדות נדרשים לפני שליחה (ללא ערכי סוד).
 */
export function payProtocolSignFieldPresence(opts) {
  const amountStr = formatHypPayAmountNis(opts.amountNis);
  const invEmail =
    Boolean(opts.invoiceEmail) &&
    Boolean(sanitizeHypInvoiceEmail(opts.customerEmail));
  const invSms =
    Boolean(opts.invoiceSms) &&
    normalizeIsraeliCellForHyp(opts.phone).ok;
  return {
    action_APISign: true,
    What_SIGN: true,
    KEY: Boolean(opts.key),
    PassP: Boolean(opts.passP),
    Masof: Boolean(opts.masof?.replace(/\D/g, "")),
    Order: Boolean(opts.order),
    Info: Boolean(String(opts.info ?? "").trim()),
    Amount_nonEmpty: Boolean(amountStr),
    Amount_value: amountStr || "(invalid)",
    Coin_ILS: "1",
    UTF8: true,
    PageLang: opts.pageLang === "ENG" ? "ENG" : "HEB",
    successUrl_inThisBuilder: false,
    failUrl_inThisBuilder: false,
    invoice_SendHesh: invEmail,
    invoice_sendHeshSMS: invSms,
    invoice_heshDesc: Boolean(String(opts.heshDesc ?? "").trim()),
    Pritim: Boolean(opts.pritim),
    note_Pritim:
      opts.pritim && String(opts.heshDesc ?? "").trim()
        ? "Pritim=True with Yaad item-line heshDesc when orderDetails match Amount."
        : "heshDesc is plain summary when Pritim is off.",
    note_returnUrls:
      "Hyp Pay APISign flow in this app does not append SuccessUrl/FailUrl; configure redirects in Hyp Pay terminal / portal.",
    note_ccode902:
      "If Hyp returns CCode=902 in errMsg before payment page, it is a gateway/terminal rule (often 3DS/card-brand), not a missing redirect in this request.",
  };
}

/**
 * קריאת פרמטרי חזרה מ־Hyp/YaadPay מה־URL (כולל query ב־hash).
 * @param {string} href
 * @returns {Record<string, string>}
 */
export function readHypCallbackQueryFromHref(href) {
  /** @type {Record<string, string>} */
  const out = {};
  try {
    const u = new URL(href);
    u.searchParams.forEach((v, k) => {
      out[k] = v;
    });
    const hash = u.hash.replace(/^#\??/, "");
    if (hash) {
      const hp = new URLSearchParams(hash);
      hp.forEach((v, k) => {
        if (out[k] == null || out[k] === "") out[k] = v;
      });
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * חילוץ קודי שגיאה מתשובת טקסט של Hyp (לדיבוג).
 * @param {URLSearchParams} sp
 */
export function extractHypErrorCodes(sp) {
  if (!sp) return {};
  const pick = (k) => sp.get(k) || sp.get(k.toLowerCase());
  return {
    CCode: pick("CCode") || pick("ccode"),
    errMsg: pick("errMsg"),
    error: pick("error"),
    message: pick("message"),
  };
}
