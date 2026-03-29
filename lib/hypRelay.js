/**
 * Hyp (CreditGuard) Relay helpers — payment page (doDeal / TxnSetup).
 * @see https://developers.hyp.co.il/payment-page-integration/integrating-hyps-payment-page-and-accepting-payment
 */

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{
 *   terminalNumber: string,
 *   mid: string,
 *   uniqueid: string,
 *   totalAgorot: number,
 *   successUrl: string,
 *   errorUrl: string,
 *   cancelUrl: string,
 *   language?: 'HEB' | 'ENG',
 *   customerName?: string,
 *   orderDescription?: string,
 * }} opts
 */
export function buildDoDealPaymentPageXml(opts) {
  const lang = opts.language === "ENG" ? "ENG" : "HEB";
  const total = Math.max(0, Math.round(Number(opts.totalAgorot) || 0));
  const desc = opts.orderDescription?.trim() || "Burger Hut order";
  const name = opts.customerName?.trim() || "";
  const userRef = [desc, name].filter(Boolean).join(" — ");
  const sendUser =
    process.env.HYP_RELAY_SEND_USER_REF === "1" ||
    process.env.HYP_RELAY_SEND_USER_REF === "true";
  const userXml =
    sendUser && userRef
      ? `\n      <user>${escapeXml(userRef.slice(0, 200))}</user>`
      : "";
  return `<ashrait>
  <request>
    <version>2000</version>
    <language>${lang}</language>
    <command>doDeal</command>
    <doDeal>
      <terminalNumber>${escapeXml(opts.terminalNumber)}</terminalNumber>
      <cardNo>CGMPI</cardNo>
      <total>${total}</total>
      <transactionType>Debit</transactionType>
      <creditType>RegularCredit</creditType>
      <currency>ILS</currency>
      <transactionCode>Internet</transactionCode>
      <validation>TxnSetup</validation>
      <mid>${escapeXml(opts.mid)}</mid>
      <uniqueid>${escapeXml(opts.uniqueid)}</uniqueid>
      <mpiValidation>AutoComm</mpiValidation>
      <successUrl>${escapeXml(opts.successUrl)}</successUrl>
      <errorUrl>${escapeXml(opts.errorUrl)}</errorUrl>
      <cancelUrl>${escapeXml(opts.cancelUrl)}</cancelUrl>${userXml}
    </doDeal>
  </request>
</ashrait>`;
}

/**
 * @param {string} xmlText
 * @returns {{ ok: boolean, result?: string, mpiHostedPageUrl?: string, message?: string, userMessage?: string }}
 */
export function parseDoDealPaymentPageResponse(xmlText) {
  if (!xmlText || typeof xmlText !== "string") {
    return { ok: false, message: "empty_response" };
  }
  const resultM = xmlText.match(/<result>\s*([^<]*?)\s*<\/result>/i);
  const result = resultM ? resultM[1].trim() : "";
  const msgM = xmlText.match(/<message>\s*([^<]*?)\s*<\/message>/i);
  const message = msgM ? msgM[1].trim() : undefined;
  const userMsgM = xmlText.match(
    /<userMessage>\s*([^<]*?)\s*<\/userMessage>/i
  );
  const userMessage = userMsgM ? userMsgM[1].trim() : undefined;
  const urlBlock = xmlText.match(
    /<mpiHostedPageUrl>\s*([\s\S]*?)\s*<\/mpiHostedPageUrl>/i
  );
  const rawUrl = urlBlock ? urlBlock[1].replace(/\s+/g, "").trim() : "";
  if (result === "000" && rawUrl) {
    return { ok: true, result, mpiHostedPageUrl: rawUrl, message };
  }
  return {
    ok: false,
    result: result || undefined,
    message: message || userMessage || "relay_rejected",
    userMessage: userMessage || undefined,
  };
}
