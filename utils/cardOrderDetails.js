import { lineTotal } from "@/utils/cartMoney";
import { sortSaladsForDisplay } from "@/utils/saladDisplayOrder";
import { cartLineProductId } from "@/hooks/useCart";

/** פירוט שורות ל־Hyp / לוג — תוספות ומחיר שורה */
export function buildCardOrderDetailsFromItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const tops = (item.toppings || []).map((x) => x.label || x.name || x.id);
    const sals = sortSaladsForDisplay(item.salads || []).map(
      (x) => x.label || x.name || x.id
    );
    const exs = (item.extras || []).map((x) => x.label || x.name || x.id);
    const pid = String(cartLineProductId(item) || "");
    const specialPattyGramsValue =
      pid === "special-cheese-bomb"
        ? undefined
        : pid === "special-lettuce-burger"
          ? 160
          : pid.startsWith("special-")
            ? Number(item.specialPattyGrams) === 220
              ? 220
              : 200
            : undefined;
    return {
      name: item.name,
      quantity: item.quantity,
      sizeLabel: item.sizeLabel || undefined,
      variantLabel: item.variantLabel || undefined,
      burgerDonenessLabel: item.burgerDoneness?.label
        ? String(item.burgerDoneness.label).trim() || undefined
        : undefined,
      bunSauceOnBun:
        typeof item.bunSauceOnBun === "boolean"
          ? item.bunSauceOnBun
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
      mealFriesLabel: item.mealFriesLabel
        ? String(item.mealFriesLabel).trim() || undefined
        : undefined,
      mealFriesPrice: Number.isFinite(Number(item.mealFriesPrice))
        ? Number(item.mealFriesPrice)
        : undefined,
      sellerNotes: item.sellerNotes
        ? String(item.sellerNotes).trim() || undefined
        : undefined,
      ...(specialPattyGramsValue != null
        ? { specialPattyGrams: specialPattyGramsValue }
        : {}),
    };
  });
}
