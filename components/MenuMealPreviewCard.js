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
          <p className="mt-1 text-sm font-semibold text-primary">
            {t("ui.fromPrice")} ₪{formatIls(item.basePrice)}
          </p>
        </div>
      </div>
      <div className="border-t border-slate-800 p-3">
        {item?.category === "specials" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <button
              type="button"
              onClick={() => onOpenSpecialSaladsEdit?.(item)}
              disabled={isOutOfStock}
              className="btn-primary flex-1 text-sm disabled:opacity-50"
            >
              {t("ui.editComponents")}
            </button>
            <button
              type="button"
              onClick={() => onSpecialQuickAdd?.(item)}
              disabled={isOutOfStock}
              className="flex-1 rounded-xl border-2 border-primary/80 bg-slate-900/80 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
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
