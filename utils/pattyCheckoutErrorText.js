/**
 * @param {(key: string) => string} t
 * @param {unknown} pattyShortfalls
 * @param {unknown} pattyAffectedLines
 */
export function insufficientPattiesUiMessage(t, pattyShortfalls, pattyAffectedLines) {
  if (Array.isArray(pattyShortfalls) && pattyShortfalls.length > 0) {
    return buildInsufficientPattiesMessage(
      t,
      pattyShortfalls,
      Array.isArray(pattyAffectedLines) ? pattyAffectedLines : []
    );
  }
  return t("err.insufficientPatties");
}

/**
 * @param {(key: string) => string} t
 * @param {{ g: number, need: number, have: number }[]} shortfalls
 * @param {{ productId: string, name: string, quantity: number }[]} affectedLines
 */
function buildInsufficientPattiesMessage(t, shortfalls, affectedLines) {
  const fmt = (s, vars) =>
    Object.entries(vars).reduce(
      (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
      s
    );
  const gramText = shortfalls
    .map((s) =>
      fmt(t("err.insufficientPattiesGram"), {
        g: s.g,
        need: s.need,
        have: s.have,
      })
    )
    .join(t("err.insufficientPattiesGramSep"));
  let msg = `${t("err.insufficientPattiesIntro")} ${gramText}`;
  const meals = (affectedLines || [])
    .map((r) =>
      fmt(t("err.insufficientPattiesMealItem"), {
        qty: r.quantity,
        name: r.name,
      })
    )
    .join(t("err.insufficientPattiesMealSep"));
  if (meals) {
    msg += ` ${t("err.insufficientPattiesMealsIntro")} ${meals}.`;
  }
  msg += ` ${t("err.insufficientPattiesAction")}`;
  return msg.trim();
}
