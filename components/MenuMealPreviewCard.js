import { useMemo } from "react";
import { formatIls } from "@/utils/cartMoney";
import { useLocale } from "@/contexts/LocaleContext";
import { menuItemDesc, menuItemName } from "@/utils/menuItemLabels";
import { useInventory } from "@/contexts/InventoryContext";
import { useOrderingHours } from "@/contexts/OrderingHoursContext";
import { useCart } from "@/hooks/useCart";
import { remainingPattyServingsForMenuItem } from "@/utils/burgerPattyPrep";
import {
  specialPattyGramsDefaultForStock,
  SPECIAL_PATTY_220_EXTRA_NIS,
} from "@/utils/specialBurgerDefaults";

export default function MenuMealPreviewCard({
  item,
  onOpenWizard,
  onOpenSpecialSaladsEdit,
}) {
  const { t, locale } = useLocale();
  const { isUnavailable, pattyStock } = useInventory();
  const { restaurantOpen } = useOrderingHours();
  const { items: cartItems } = useCart();
  const isOutOfStock = isUnavailable(item.id);

  const pattyRemainingFewLabel = useMemo(() => {
    if (item.category !== "burgers" && item.category !== "specials")
      return null;
    if (!restaurantOpen) return null;
    if (isOutOfStock) return null;
    const n = remainingPattyServingsForMenuItem(
      cartItems,
      item.id,
      pattyStock
    );
    if (n == null || n > 5) return null;
    return t("ui.menuPattyRemainingFew").replace("{n}", String(n));
  }, [
    item.category,
    item.id,
    cartItems,
    pattyStock,
    restaurantOpen,
    isOutOfStock,
    t,
  ]);

  const mealFromPriceIls = useMemo(() => {
    const base = Number(item.basePrice) || 0;
    if (
      item.category !== "specials" ||
      item.id === "special-cheese-bomb"
    ) {
      return base;
    }
    const g = specialPattyGramsDefaultForStock(item.id, pattyStock);
    return base + (g === 220 ? SPECIAL_PATTY_220_EXTRA_NIS : 0);
  }, [item.basePrice, item.category, item.id, pattyStock]);

  const name = menuItemName(item, t, locale);
  const description = menuItemDesc(item, t, locale, pattyStock);

  const isShiftedCrispyImage =
    item.id === "crispy-chicken-burger-kids" ||
    item.id === "crispy-chicken-tortilla-large";

  return (
    <div className="card relative min-w-0 max-w-full overflow-hidden">
      {pattyRemainingFewLabel ? (
        <p
          className="pointer-events-none absolute left-2 top-2 z-[2] max-w-[calc(100%-1rem)] rounded-md border border-amber-700/60 bg-slate-950/90 px-1.5 py-0.5 text-[9px] font-bold leading-tight text-amber-100/95 shadow-sm sm:text-[10px]"
          dir="rtl"
        >
          {pattyRemainingFewLabel}
        </p>
      ) : null}
      <div className="flex gap-3 p-3">
        <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-slate-800">
          <img
            src={item.image}
            alt={name}
            className={`h-full w-full object-cover ${
              item.id === "side-mashed-balls"
                ? "scale-[1.38] object-center"
                : isShiftedCrispyImage
                  ? "scale-125 object-[22%_center]"
                  : ""
            }`}
            loading="lazy"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <h3 className="text-sm font-semibold">{name}</h3>
          {isOutOfStock ? (
            <p className="mt-1.5 text-base font-extrabold leading-snug text-red-500">
              {t("ui.outOfStock")}
            </p>
          ) : null}
          <p className="line-clamp-3 text-xs text-gray-400">{description}</p>
          <p
            dir="rtl"
            className="mt-1 text-sm font-semibold text-primary tabular-nums"
          >
            {t("ui.fromPrice")} ₪{formatIls(mealFromPriceIls)}
          </p>
        </div>
      </div>
      <div className="border-t border-slate-800 p-3">
        {item?.category === "specials" ? (
          <button
            type="button"
            onClick={() => onOpenSpecialSaladsEdit?.(item)}
            disabled={isOutOfStock}
            className="btn-primary min-h-[2.75rem] w-full text-sm disabled:opacity-50"
          >
            {t("ui.editComponents")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenWizard(item)}
            disabled={isOutOfStock}
            className="btn-primary w-full text-sm disabled:opacity-50"
          >
            {t("ui.openCustomize")}
          </button>
        )}
      </div>
    </div>
  );
}
