import { formatIls } from "@/utils/cartMoney";
import { useLocale } from "@/contexts/LocaleContext";
import { menuItemDesc, menuItemName } from "@/utils/menuItemLabels";
import { useInventory } from "@/contexts/InventoryContext";

export default function MenuMealPreviewCard({
  item,
  onOpenWizard,
  onOpenSpecialSaladsEdit,
  onSpecialQuickAdd,
}) {
  const { t, locale } = useLocale();
  const { isUnavailable } = useInventory();
  const isOutOfStock = isUnavailable(item.id);

  const name = menuItemName(item, t, locale);
  const description = menuItemDesc(item, t, locale);

  const isShiftedCrispyImage =
    item.id === "crispy-chicken-burger-kids" ||
    item.id === "crispy-chicken-tortilla-large";

  return (
    <div className="card min-w-0 max-w-full overflow-hidden">
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
          <div
            dir="ltr"
            className="mt-1 flex min-w-0 flex-row items-center justify-between gap-2"
          >
            <span
              className="max-w-[58%] shrink truncate rounded border border-amber-600/45 bg-amber-950/75 px-1.5 py-0.5 text-[9px] font-bold leading-tight text-amber-100/95 sm:max-w-[55%] sm:text-[10px]"
              title={t("ui.mealIncludesMixChips")}
            >
              {t("ui.mealIncludesMixChips")}
            </span>
            <p
              dir="rtl"
              className="shrink-0 text-sm font-semibold text-primary tabular-nums"
            >
              {t("ui.fromPrice")} ₪{formatIls(item.basePrice)}
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-800 p-3">
        {item?.category === "specials" ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpenSpecialSaladsEdit?.(item)}
              disabled={isOutOfStock}
              className="btn-primary min-h-[2.75rem] w-full min-w-0 px-2 text-xs font-semibold leading-tight disabled:opacity-50 sm:text-sm"
            >
              {t("ui.editComponents")}
            </button>
            <button
              type="button"
              onClick={() => onSpecialQuickAdd?.(item)}
              disabled={isOutOfStock}
              className="min-h-[2.75rem] w-full min-w-0 rounded-xl border-2 border-primary/80 bg-slate-900/80 px-2 text-xs font-bold leading-tight text-primary transition-colors hover:bg-primary/10 disabled:opacity-50 sm:text-sm"
            >
              {t("ui.addSpecialToCart")}
            </button>
          </div>
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
