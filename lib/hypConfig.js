/**
 * קריאת הגדרות Hyp מ־process.env בלבד (מוכן ל־Vercel).
 */

/** דומיינים שמופיעים לעתים בטעות ב-.env ואינם קיימים ב-DNS */
const KNOWN_INVALID_RELAY_HOSTS = new Set(["sandbox.creditguard.co.il"]);

/**
 * @param {string} relayEndpoint מלא, למשל https://host/xpo/Relay
 * @returns {{ host: string } | null}
 */
export function getKnownInvalidRelayHost(relayEndpoint) {
  if (!relayEndpoint || typeof relayEndpoint !== "string") return null;
  try {
    const u = new URL(relayEndpoint);
    const h = u.hostname.toLowerCase();
    if (KNOWN_INVALID_RELAY_HOSTS.has(h)) return { host: h };
  } catch {
    return null;
  }
  return null;
}

/**
 * כתובת מלאה ל־POST (CreditGuard Relay).
 * אם ב־.env כבר מופיע סיומת /xpo/Relay — לא מוסיפים פעמיים.
 */
export function getHypRelayEndpoint() {
  let base = (process.env.HYP_RELAY_BASE || "").trim().replace(/\/$/, "");
  if (!base) return "";
  if (/\/xpo\/Relay\/?$/i.test(base)) {
    return base.replace(/\/$/, "");
  }
  return `${base}/xpo/Relay`;
}

export function getHypTerminal() {
  return process.env.HYP_TERMINAL?.trim() || "";
}

/** mid — תומך ב־HYP_MERCHANT (שם מה-.env.local שלך) או HYP_MID */
export function getHypMerchantId() {
  return (
    process.env.HYP_MERCHANT?.trim() ||
    process.env.HYP_MID?.trim() ||
    ""
  );
}

/**
 * Relay דורש user + password בגוף הבקשה.
 * - HYP_API_USER + HYP_API_PASSWORD
 * - HYP_API_USER + HYP_API_KEY (מפתח כסיסמה)
 * - HYP_API_KEY בפורמט user:password
 * - HYP_API_KEY בודד: ניסיון עם user = HYP_TERMINAL (מקובל בחלק מסביבות בדיקה)
 */
export function getHypRelayCredentials() {
  const user = process.env.HYP_API_USER?.trim();
  const password = process.env.HYP_API_PASSWORD?.trim();
  const key = process.env.HYP_API_KEY?.trim();
  const terminal = getHypTerminal();

  if (user && password) return { user, password };
  if (user && key) return { user, password: key };
  if (key && key.includes(":")) {
    const i = key.indexOf(":");
    const u = key.slice(0, i).trim();
    const p = key.slice(i + 1).trim();
    if (u && p) return { user: u, password: p };
  }
  if (key && terminal) return { user: terminal, password: key };

  return null;
}

export function listMissingHypEnvKeys() {
  const missing = [];
  if (!getHypRelayEndpoint()) missing.push("HYP_RELAY_BASE");
  if (!getHypTerminal()) missing.push("HYP_TERMINAL");
  if (!getHypMerchantId()) missing.push("HYP_MERCHANT (or HYP_MID)");
  if (!getHypRelayCredentials()) {
    missing.push(
      "HYP_API_KEY (user:password or single key with HYP_TERMINAL), or HYP_API_USER + password"
    );
  }
  return missing;
}
