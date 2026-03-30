/**
 * Hyp Pay Protocol only — credentials מ־process.env (Vercel-safe).
 * Relay / XML / CreditGuard POST אינם נתמכים.
 */

import { normalizeMasof } from "./hypPayProtocol";

export function getHypPayBase() {
  const raw = (process.env.HYP_PAY_BASE || "https://pay.hyp.co.il/p").trim();
  return raw.replace(/\/?$/, "/");
}

/**
 * API KEY ממסך Terminal Settings בפורטל Hyp Pay — חובה.
 * לא בפורמט user:password (מסלול Relay ישן).
 */
export function getHypApiKey() {
  return process.env.HYP_API_KEY?.trim() || "";
}

export function getHypMasofForPay() {
  return normalizeMasof(
    process.env.HYP_TERMINAL?.trim() || process.env.HYP_MASOF?.trim() || ""
  );
}

/**
 * PassP מהפורטל. אם שמרתם את PassP תחת HYP_MERCHANT (שם מבלבל אך נפוץ) — זה יילקח כאן.
 */
export function getHypPayPassP() {
  return (
    process.env.HYP_PASSP?.trim() ||
    process.env.HYP_MERCHANT?.trim() ||
    process.env.HYP_API_PASSWORD?.trim() ||
    ""
  );
}

/**
 * @returns {{ ok: true } | { ok: false, error: string, missing?: string[], reason?: string }}
 */
export function validateHypPayEnv() {
  const missing = [];
  const key = getHypApiKey();
  if (!key) {
    missing.push("HYP_API_KEY");
  } else if (key.includes(":")) {
    return {
      ok: false,
      error: "hyp_api_key_invalid",
      reason:
        "HYP_API_KEY must be the Hyp Pay API KEY only (plain string). The user:password format was used by the removed Relay integration.",
    };
  }
  if (!getHypMasofForPay()) missing.push("HYP_TERMINAL");
  const passP = getHypPayPassP();
  if (!passP) {
    missing.push(
      "HYP_PASSP (PassP from Hyp portal; or set HYP_MERCHANT to that value if you use three vars: KEY / TERMINAL / MERCHANT-as-PassP)"
    );
  }
  if (missing.length) {
    return { ok: false, error: "hyp_not_configured", missing };
  }
  return { ok: true };
}

/** תמיד Pay Protocol — אינטגרציית Relay הוסרה */
export function resolveHypIntegrationMode() {
  return "pay";
}

export function listMissingHypPayEnvKeys() {
  const v = validateHypPayEnv();
  if (v.ok) return [];
  if (v.missing) return v.missing;
  return [];
}

/** משתנים שאפשר להציג בלוג דיבוג כטקסט קצר (לא סודות). */
const HYP_DEBUG_PUBLIC_NAMES = new Set(["HYP_PAY_BASE", "HYP_DEBUG_LOG"]);

/**
 * צילום HYP_* ללוג — לעולם לא ערכי מפתחות/סיסמאות/מסוף מלאים.
 */
export function getHypEnvDebugSnapshot() {
  /** @type {Record<string, unknown>} */
  const vars = {};
  for (const name of Object.keys(process.env).sort()) {
    if (!name.startsWith("HYP_")) continue;
    const raw = process.env[name];
    if (raw == null || raw === "") {
      vars[name] = "(empty)";
      continue;
    }
    if (HYP_DEBUG_PUBLIC_NAMES.has(name)) {
      const s = String(raw);
      vars[name] = s.length > 256 ? `${s.slice(0, 256)}…` : s;
      continue;
    }
    vars[name] = {
      present: true,
      length: raw.length,
      ...(name === "HYP_API_KEY" ? { hasColon: raw.includes(":") } : {}),
    };
  }
  if (Object.keys(vars).length === 0) {
    vars._warning = "no HYP_* keys in process.env";
  }
  const envCheck = validateHypPayEnv();
  return {
    vars,
    payBase: getHypPayBase(),
    integration: "pay",
    hypPayEnvOk: envCheck.ok,
    hypPayEnvIssue: envCheck.ok ? null : envCheck,
  };
}

/**
 * לוג צילום HYP_* רק בפיתוח ובפירוש — לא ב-Vercel production (נמנע דליפה ללוגי ענן).
 */
export function shouldLogHypEnvDebug() {
  if (process.env.HYP_DEBUG_LOG === "0" || process.env.HYP_DEBUG_LOG === "false") {
    return false;
  }
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return (
    process.env.HYP_DEBUG_LOG === "1" ||
    process.env.HYP_DEBUG_LOG === "true"
  );
}
