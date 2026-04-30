import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useCart,
  cartLineProductId,
  lineHasUnavailableInventory,
} from "@/hooks/useCart";
import {
  pattyCartShortageMessage,
  simulateCartAfterQuantityUpdate,
  validatePattyStockForSimulatedCart,
} from "@/utils/pattyStockClient";
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
import { specialBurgerMenuDescription } from "@/utils/specialBurgerMealDescription";
import { aggregateMealFriesCartSummary } from "@/utils/mealFriesCartSummary";

export default function StickyCartBar() {
  const { t, locale } = useLocale();
  const { items, total, updateQuantity, removeItem } = useCart();
  const { menuItems } = useMenuCatalog();
  const { openMealEditLine } = useMealWizard();
  const { isUnavailable } = useInventory();
  const [panelOpen, setPanelOpen] = useState(false);
  const [pattyCartMessage, setPattyCartMessage] = useState("");

  useEffect(() => {
    if (!items.length) setPanelOpen(false);
  }, [items.length]);

  useEffect(() => {
    setPattyCartMessage("");
  }, [items]);

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

  const mealFriesCartSummary = useMemo(
    () => aggregateMealFriesCartSummary(items, locale),
    [items, locale]
  );

  const tryIncreaseQuantity = async (item) => {
    const nextQty = item.quantity + 1;
    setPattyCartMessage("");
    const nextLines = simulateCartAfterQuantityUpdate(
      items,
      item.id,
      nextQty
    );
    const hintPid = cartLineProductId(item);
    const check = await validatePattyStockForSimulatedCart(
      nextLines,
      hintPid,
      item.specialPattyGrams
    );
    if (!check.ok) {
      setPattyCartMessage(pattyCartShortageMessage(t, check));
      return;
    }
    updateQuantity(item.id, nextQty);
  };

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
            {pattyCartMessage ? (
              <p className="mb-2 whitespace-pre-line rounded-lg border border-red-500/40 bg-red-950/40 px-2 py-2 text-[11px] font-semibold leading-snug text-red-200">
                {pattyCartMessage}
              </p>
            ) : null}
            <div className="space-y-2">
              {items.map((item, index) => {
                const lineOos = lineHasUnavailableInventory(item, isUnavailable);
                return (
                <div
                  key={`${item.id}-${index}`}
                  className="flex flex-col gap-2 rounded-lg bg-slate-900/80 p-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      {item.quantity > 1 ? (
                        <ol className="mb-0.5 list-inside list-decimal space-y-0.5 text-sm font-semibold leading-snug text-gray-100">
                          {Array.from(
                            { length: item.quantity },
                            (_, u) => (
                              <li key={u}>{item.name}</li>
                            )
                          )}
                        </ol>
                      ) : (
                        <span className="text-sm font-semibold leading-snug">
                          {item.name}
                        </span>
                      )}
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
                    {(() => {
                      const pid = cartLineProductId(item);
                      if (!String(pid).startsWith("special-")) return null;
                      const mealDesc = specialBurgerMenuDescription(
                        locale,
                        pid,
                        item.specialPattyGrams
                      );
                      if (!mealDesc) return null;
                      return (
                        <p className="text-[11px] text-gray-400">
                          {t("checkout.specialMealComponentsPrefix")}: {mealDesc}
                        </p>
                      );
                    })()}
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
                    {item.mealFriesLabel ? (
                      <p className="text-[11px] text-emerald-200/90">
                        {t("wa.mealFries")}: {item.mealFriesLabel}
                        {Number.isFinite(Number(item.mealFriesPrice))
                          ? ` (+₪${formatIls(Number(item.mealFriesPrice))})`
                          : ""}
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
                        onClick={() => {
                          setPattyCartMessage("");
                          updateQuantity(item.id, item.quantity - 1);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 text-sm leading-none"
                      >
                        −
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => void tryIncreaseQuantity(item)}
                        disabled={lineOos}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 text-sm leading-none disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <p
                      className="text-sm font-semibold text-primary"
                      dir="ltr"
                    >
                      ₪{formatIls(lineTotal(item))}
                    </p>
                  </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-4 border-t border-slate-800/70 pt-2">
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
                        className="text-[11px] font-semibold text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
                      >
                        {t("cart.editMeal")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-[11px] font-semibold leading-none text-red-400 hover:text-red-300"
                    >
                      {t("checkout.remove")}
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
            {mealFriesCartSummary.length > 0 ? (
              <div className="mt-3 rounded-lg border border-emerald-900/45 bg-emerald-950/25 px-2 py-2">
                <p className="mb-1 text-[10px] font-semibold text-emerald-100/95">
                  {t("checkout.mealFriesCartSummaryTitle")}
                </p>
                <ul className="space-y-0.5 text-[10px] leading-snug text-gray-300">
                  {mealFriesCartSummary.map((row) => (
                    <li
                      key={row.key}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <span className="min-w-0 flex-1">{row.label}</span>
                      <span className="shrink-0 tabular-nums text-emerald-200/90">
                        ×{row.qty}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
