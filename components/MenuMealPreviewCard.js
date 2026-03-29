import { formatIls } from "@/utils/cartMoney";
import { useLocale } from "@/contexts/LocaleContext";
import { useInventory } from "@/contexts/InventoryContext";
import { useOrderingHours } from "@/contexts/OrderingHoursContext";

export default function MenuMealPreviewCard({ item, onOpenWizard }) {
  const { t } = useLocale();
  const { orderingAllowed } = useOrderingHours();
  const { isUnavailable } = useInventory();
  const isOutOfStock = isUnavailable(item.id);
  const orderingClosed = !orderingAllowed;

  const name = t(`menu.${item.id}.name`);
  const description = t(`menu.${item.id}.desc`);

  const isShiftedCrispyImage =
    item.id === "crispy-chicken-burger-kids" ||
    item.id === "crispy-chicken-tortilla-large";

  return (
    <div className="card overflow-hidden">
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
          {orderingClosed && !isOutOfStock ? (
            <p className="mt-1.5 text-sm font-semibold leading-snug text-amber-200/90">
              {t("err.orderingClosed")}
            </p>
          ) : null}
          <p className="line-clamp-3 text-xs text-gray-400">{description}</p>
          <p className="mt-1 text-sm font-semibold text-primary">
            {t("ui.fromPrice")} ₪{formatIls(item.basePrice)}
          </p>
        </div>
      </div>
      <div className="border-t border-slate-800 p-3">
        <button
          type="button"
          onClick={() => onOpenWizard(item)}
          disabled={isOutOfStock || orderingClosed}
          className="btn-primary w-full text-sm disabled:opacity-50"
        >
          {t("ui.openCustomize")}
        </button>
      </div>
    </div>
  );
}
