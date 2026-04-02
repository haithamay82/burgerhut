import { lineTotal } from "@/utils/cartMoney";

/** פירוט שורות ל־Hyp / לוג — תוספות ומחיר שורה */
export function buildCardOrderDetailsFromItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const tops = (item.toppings || []).map((x) => x.label || x.name || x.id);
    const sals = (item.salads || []).map((x) => x.label || x.name || x.id);
    const exs = (item.extras || []).map((x) => x.label || x.name || x.id);
    return {
      name: item.name,
      quantity: item.quantity,
      sizeLabel: item.sizeLabel || undefined,
      variantLabel: item.variantLabel || undefined,
      burgerDonenessLabel: item.burgerDoneness?.label
        ? String(item.burgerDoneness.label).trim() || undefined
        : undefined,
      toppings: tops,
      salads: sals,
      extras: exs,
      lineTotal: lineTotal(item),
      requestedDrinkLabel: item.requestedDrinkLabel
        ? String(item.requestedDrinkLabel).trim() || undefined
        : undefined,
      requestedDrinkPrice: Number.isFinite(Number(item.requestedDrinkPrice))
        ? Number(item.requestedDrinkPrice)
        : undefined,
      sellerNotes: item.sellerNotes
        ? String(item.sellerNotes).trim() || undefined
        : undefined,
    };
  });
}
