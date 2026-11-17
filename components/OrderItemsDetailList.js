import { cartLineProductId } from "@/hooks/useCart";
import { formatCartLineSaladsForOrder } from "@/utils/saladDisplayOrder";
import { specialBurgerMenuDescription } from "@/utils/specialBurgerMealDescription";
import { getCartItemsInWhatsAppOrder } from "@/utils/whatsapp";

/**
 * פירוט פריטי הזמנה (כמו במסך מטבח/ניהול) — לתצוגת לקוח או משותפת.
 * @param {{
 *   items: unknown[],
 *   t: (k: string) => string,
 *   locale?: string,
 *   className?: string,
 * }} props
 */
export default function OrderItemsDetailList({
  items,
  t,
  locale = "he",
  className = "",
}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;

  const entries = getCartItemsInWhatsAppOrder(list, locale);

  return (
    <ul
      className={`space-y-2 text-right text-xs text-gray-300 ${className}`}
      dir="rtl"
    >
      {entries.map((entry, waIdx) => {
        if (entry.type === "header") {
          return (
            <li key={`wa-h-${waIdx}`} className="list-none py-1">
              <p className="text-[11px] font-bold text-primary/95">
                {entry.label}
              </p>
            </li>
          );
        }
        const it = entry.item;
        const displayIndex = entry.displayIndex;
        const qty = Number(it.quantity) || 1;
        const lineTotal = (Number(it.price) * qty).toFixed(2);
        const saladsText = formatCartLineSaladsForOrder(it, t);
        const pid = cartLineProductId(it);
        const mealDesc = specialBurgerMenuDescription(
          locale,
          pid,
          it.specialPattyGrams
        );

        return (
          <li
            key={
              it.id ||
              `wa-${displayIndex}-${it.name}-${it.price}`
            }
            className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-2"
          >
            <p className="text-[13px] font-semibold text-gray-100">
              <span className="text-primary">{displayIndex}.</span> {it.name}
              {" — "}₪{lineTotal}
            </p>
            {it.sizeLabel ? (
              <p className="mt-1 text-[11px] text-gray-400">
                {t("checkout.size")}: {it.sizeLabel}
              </p>
            ) : null}
            {it.variantLabel ? (
              <p className="text-[11px] text-gray-400">
                {t("checkout.variant")}: {it.variantLabel}
              </p>
            ) : null}
            {saladsText != null ? (
              <p className="text-[11px] text-gray-400">
                {t("checkout.saladsPrefix")}: {saladsText}
              </p>
            ) : null}
            {mealDesc ? (
              <p className="text-[11px] text-gray-400">
                {t("checkout.specialMealComponentsPrefix")}: {mealDesc}
              </p>
            ) : null}
            {typeof it.bunSauceOnBun === "boolean" ? (
              <p className="text-[11px] text-gray-400">
                {t("checkout.bunSauceOnBunPrefix")}:{" "}
                {it.bunSauceOnBun ? t("ui.bunSauceYes") : t("ui.bunSauceNo")}
              </p>
            ) : null}
            {it.burgerDoneness?.label ? (
              <p className="text-[11px] text-gray-400">
                {t("checkout.donenessPrefix")}: {it.burgerDoneness.label}
              </p>
            ) : null}
            {it.toppings?.length ? (
              <p className="text-[11px] text-gray-400">
                {t("checkout.toppingsPrefix")}:{" "}
                {it.toppings.map((x) => x.label).join(", ")}
              </p>
            ) : null}
            {it.extras?.length ? (
              <p className="text-[11px] text-gray-400">
                {t("checkout.extrasPrefix")}:{" "}
                {it.extras.map((x) => x.label).join(", ")}
              </p>
            ) : null}
            {it.mealFriesLabel ? (
              <p className="text-[11px] text-emerald-200/90">
                {t("checkout.mealFriesPrefix")}: {it.mealFriesLabel}
                {Number.isFinite(Number(it.mealFriesPrice))
                  ? ` (+₪${Number(it.mealFriesPrice).toFixed(0)})`
                  : ""}
              </p>
            ) : null}
            {it.requestedDrinkLabel ? (
              <p className="text-[11px] text-sky-200/90">
                {t("wa.drink")}: {it.requestedDrinkLabel}
                {Number.isFinite(Number(it.requestedDrinkPrice))
                  ? ` (+₪${Number(it.requestedDrinkPrice).toFixed(0)})`
                  : ""}
              </p>
            ) : null}
            {it.sellerNotes ? (
              <p className="text-[11px] text-amber-200/90">
                {t("ui.sellerNotes")}: {it.sellerNotes}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
