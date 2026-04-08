import { getInventoryPayload } from "@/lib/inventoryStore";
import {
  aggregatePattyCountsFromOrderItems,
  pattyDemandFitsStock,
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

  const items = body.items;
  if (!Array.isArray(items)) {
    return res.status(400).json({ ok: false, error: "invalid_items" });
  }

  const inv = await getInventoryPayload();
  if (inv.pattyStock == null) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const prep = aggregatePattyCountsFromOrderItems(items);
  const ok = pattyDemandFitsStock(prep.counts, inv.pattyStock);
  if (!ok) {
    return res.status(200).json({ ok: false, error: "insufficient_patties" });
  }
  return res.status(200).json({ ok: true });
}
