import { getInventoryPayload } from "@/lib/inventoryStore";
import {
  aggregatePattyCountsFromOrderItems,
  collectPattyAffectedLines,
  computePattyShortfalls,
  maxPattyUnitsForProductWithOtherCartLines,
  pattyDemandFitsStock,
  sumQuantityForProductInItems,
} from "@/utils/burgerPattyPrep";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  let body = {};
  try {
    if (typeof req.body === "string") {
      body = JSON.parse(req.body || "{}");
    } else if (req.body && typeof req.body === "object") {
      body = req.body;
    }
  } catch {
    return res.status(400).json({ ok: false, error: "invalid_json" });
  }

  const lines =
    Array.isArray(body.lines) && body.lines.length
      ? body.lines
      : Array.isArray(body.items)
        ? body.items
        : null;
  if (!Array.isArray(lines) || !lines.length) {
    return res.status(400).json({ ok: false, error: "invalid_items" });
  }

  const inv = await getInventoryPayload();
  if (inv.pattyStock == null) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const prep = aggregatePattyCountsFromOrderItems(lines);
  const ok = pattyDemandFitsStock(prep.counts, inv.pattyStock);
  if (!ok) {
    const pattyShortfalls = computePattyShortfalls(
      prep.counts,
      inv.pattyStock
    );
    const deficientGrams = pattyShortfalls.map((s) => s.g);
    const pattyAffectedLines = collectPattyAffectedLines(
      lines,
      deficientGrams
    );
    const hintPid =
      typeof body.hintProductId === "string"
        ? body.hintProductId.trim()
        : "";
    /** @type {{ pattyCeiling?: number, pattyQtyAttempted?: number }} */
    const capPayload = {};
    if (hintPid) {
      const hintGrams =
        typeof body.hintSpecialPattyGrams === "number"
          ? body.hintSpecialPattyGrams
          : Number(body.hintSpecialPattyGrams);
      const ceiling = maxPattyUnitsForProductWithOtherCartLines(
        lines,
        hintPid,
        inv.pattyStock,
        Number.isFinite(hintGrams) ? hintGrams : undefined
      );
      if (ceiling != null) {
        const have = sumQuantityForProductInItems(lines, hintPid);
        capPayload.pattyCeiling = ceiling;
        capPayload.pattyQtyAttempted = have;
      }
    }
    return res.status(200).json({
      ok: false,
      error: "insufficient_patties",
      pattyShortfalls,
      pattyAffectedLines,
      ...capPayload,
    });
  }
  return res.status(200).json({ ok: true });
}
