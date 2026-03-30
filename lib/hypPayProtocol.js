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

function splitClientName(full) {
  const t = String(full ?? "").trim();
  if (!t) return { clientName: "Customer", clientLName: "" };
  const parts = t.split(/\s+/);
  return {
    clientName: parts[0]?.slice(0, 48) || "Customer",
    clientLName: parts.slice(1).join(" ").slice(0, 48),
  };
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
 *   phone: string,
 * }} opts
 */
export function buildApiSignUrl(opts) {
  const host = opts.host.replace(/\/?$/, "/");
  const u = new URL(host);
  const amountStr = formatHypPayAmountNis(opts.amountNis);
  const { clientName, clientLName } = splitClientName(opts.customerName);
  const cell = String(opts.phone ?? "").replace(/\D/g, "").slice(0, 20);

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
