/**
 * קישורי פתיחה מדפדפן מובנה (Google, Instagram וכו') לדפדפן מערכת ב־iOS.
 * Chrome: מתועד ע"י Google. Safari: x-safari-https לא מתועד רשמית — עשוי להשתנות בגרסאות iOS.
 *
 * @param {string} siteUrl - כתובת מלאה, למשל https://www.burgerhut.co.il/
 */
export function buildIosSafariOpenUrl(siteUrl) {
  try {
    const u = new URL(siteUrl);
    const rest = `${u.host}${u.pathname}${u.search}${u.hash}`;
    return `x-safari-https://${rest}`;
  } catch {
    return siteUrl;
  }
}

export function buildIosChromeOpenUrl(siteUrl) {
  try {
    const u = new URL(siteUrl);
    /** בלי googlechrome://https:// — ב־iOS לעיתים מוצג «לא ניתן לגשת לאתר». פורמט מומלץ: googlechrome://host/path */
    const rest = `${u.host}${u.pathname}${u.search}${u.hash}`;
    return `googlechrome://${rest}`;
  } catch {
    return siteUrl;
  }
}

/**
 * @param {string} deepLink
 */
export function navigateToIosDeepLink(deepLink) {
  if (typeof window === "undefined" || !deepLink) return;
  window.location.href = deepLink;
}
