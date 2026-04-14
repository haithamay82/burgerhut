import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCart, lineHasUnavailableInventory } from "@/hooks/useCart";
import { useMealWizard } from "@/contexts/MealWizardContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useInventory } from "@/contexts/InventoryContext";
import { useMenuCatalog } from "@/contexts/MenuCatalogContext";
import {
  isEditableMealCartLine,
  mealCatalogItemForCartLine,
} from "@/utils/mealCartLineEdit";
import { formatIls, lineTotal, safePrice } from "@/utils/cartMoney";
import { sortSaladsForDisplay } from "@/utils/saladDisplayOrder";

export default function StickyCartBar() {
  const { t } = useLocale();
  const { items, total, updateQuantity, removeItem } = useCart();
  const { menuItems } = useMenuCatalog();
  const { openMealEditLine } = useMealWizard();
  const { isUnavailable } = useInventory();
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!items.length) setPanelOpen(false);
  }, [items.length]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  const totalUnits = useMemo(
    () =>
      items.reduce(
        (sum, it) => sum + Math.max(1, Number(it.quantity) || 0),
        0
      ),
    [items]
  );
  const unitsSummaryText = useMemo(() => {
    if (totalUnits <= 0) return "";
    if (totalUnits === 1) return t("cart.unitsOne");
    return t("cart.unitsMany").replace("{count}", String(totalUnits));
  }, [totalUnits, t]);

  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col">
      <div className="pointer-events-auto mx-auto flex w-full max-w-4xl flex-col px-4">
        {panelOpen ? (
          <div
            className="mb-0 max-h-[min(58vh,28rem)] overflow-y-auto rounded-t-2xl border border-b-0 border-slate-800 bg-slate-950/98 px-3 pb-3 pt-3 shadow-[0_-8px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
            role="dialog"
            aria-label={t("cart.panelTitle")}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t("cart.panelTitle")}</h3>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-gray-300 hover:border-slate-500"
              >
                {t("cart.closePanel")}
              </button>
            </div>
            <p className="mb-2 text-[10px] leading-snug text-gray-500">
              {t("cart.menuStillVisibleHint")}
            </p>
            <div className="space-y-2">
              {items.map((item, index) => {
                const lineOos = lineHasUnavailableInventory(item, isUnavailable);
                return (
                <div
                  key={`${item.id}-${index}`}
                  className="flex items-start justify-between gap-2 rounded-lg bg-slate-900/80 p-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold leading-snug">
                        {item.name}
                      </span>
                      {isEditableMealCartLine(item, menuItems) ? (
                        <button
                          type="button"
                          onClick={() => {
                            const cat = mealCatalogItemForCartLine(
                              item,
                              menuItems
                            );
                            if (cat) openMealEditLine(cat, item);
                          }}
                          className="shrink-0 text-[11px] font-semibold leading-none text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
                        >
                          {t("cart.editMeal")}
                        </button>
                      ) : null}
                    </div>
                    {item.sizeLabel ? (
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {t("checkout.size")}: {item.sizeLabel}
                      </p>
                    ) : null}
                    {item.variantLabel ? (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.variant")}: {item.variantLabel}
                      </p>
                    ) : null}
                    {item.salads?.length ? (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.saladsPrefix")}:{" "}
                        {sortSaladsForDisplay(item.salads)
                          .map((x) => x.label)
                          .join(", ")}
                      </p>
                    ) : null}
                    {typeof item.bunSauceOnBun === "boolean" ? (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.bunSauceOnBunPrefix")}:{" "}
                        {item.bunSauceOnBun
                          ? t("ui.bunSauceYes")
                          : t("ui.bunSauceNo")}
                      </p>
                    ) : null}
                    {item.burgerDoneness?.label ? (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.donenessPrefix")}:{" "}
                        {item.burgerDoneness.label}
                      </p>
                    ) : null}
                    {item.toppings?.length ? (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.toppingsPrefix")}:{" "}
                        {item.toppings.map((x) => x.label).join(", ")}
                      </p>
                    ) : null}
                    {item.extras?.length ? (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.extrasPrefix")}:{" "}
                        {item.extras.map((x) => x.label).join(", ")}
                      </p>
                    ) : null}
                    {item.requestedDrinkLabel ? (
                      <p className="text-[11px] text-sky-200/90">
                        {t("wa.drink")}: {item.requestedDrinkLabel}
                        {Number.isFinite(Number(item.requestedDrinkPrice))
                          ? ` (+₪${formatIls(Number(item.requestedDrinkPrice))})`
                          : ""}
                      </p>
                    ) : null}
                    {item.sellerNotes ? (
                      <p className="mt-1 text-[11px] text-amber-200/90">
                        {t("ui.sellerNotes")}: {item.sellerNotes}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-gray-400">
                      {t("checkout.unitPrice")}: ₪{formatIls(safePrice(item))}
                    </p>
                    {lineOos ? (
                      <p className="mt-1 text-sm font-extrabold leading-snug text-red-500">
                        {t("ui.outOfStock")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.id, item.quantity - 1)
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 text-sm leading-none"
                      >
                        −
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.id, item.quantity + 1)
                        }
                        disabled={lineOos}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 text-sm leading-none disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <div
                      className="flex max-w-full items-center justify-end gap-2"
                      dir="ltr"
                    >
                      <p className="text-sm font-semibold text-primary">
                        ₪{formatIls(lineTotal(item))}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="shrink-0 text-[11px] leading-none text-red-400 hover:text-red-300"
                      >
                        {t("checkout.remove")}
                      </button>
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
              <span className="text-xs text-gray-400">
                {t("checkout.grandTotal")}
              </span>
              <span className="text-base font-bold text-primary">
                ₪{formatIls(total)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="border-t border-slate-800 bg-black/95 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 basis-[8rem]">
              <span className="text-xs text-gray-400">{t("cart.label")}</span>
              <p className="text-sm font-semibold">
                {unitsSummaryText} • ₪{formatIls(total)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              aria-expanded={panelOpen}
              className="flex min-h-[2.5rem] flex-1 items-center justify-center rounded-full border border-slate-600 bg-slate-900/80 px-3 text-center text-xs font-medium text-gray-100 hover:border-slate-500 md:flex-none md:px-5"
            >
              {panelOpen ? t("cart.hideCart") : t("cart.showCart")}
            </button>
            <Link
              href="/checkout"
              className="btn-primary flex min-h-[2.5rem] flex-1 items-center justify-center gap-2 text-center text-sm md:flex-none md:px-6"
            >
              <span>{t("cart.checkout")}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
