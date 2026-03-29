import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart, cartLineProductId } from "@/hooks/useCart";
import { useLocale } from "@/contexts/LocaleContext";
import { useInventory } from "@/contexts/InventoryContext";
import { useOrderingHours } from "@/contexts/OrderingHoursContext";
import { formatIls, lineTotal, safePrice } from "@/utils/cartMoney";

export default function StickyCartBar() {
  const { t } = useLocale();
  const { orderingAllowed } = useOrderingHours();
  const { items, total, updateQuantity, removeItem } = useCart();
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
                const pid = cartLineProductId(item);
                const lineOos = isUnavailable(pid);
                return (
                <div
                  key={`${item.id}-${index}`}
                  className="flex items-start justify-between gap-2 rounded-lg bg-slate-900/80 p-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug">
                      {item.name}
                    </p>
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
                        {item.salads.map((x) => x.label).join(", ")}
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
                      <span className="w-6 text-center text-sm">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.id, item.quantity + 1)
                        }
                        disabled={lineOos || !orderingAllowed}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 text-sm leading-none disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-[11px] text-red-400"
                    >
                      {t("checkout.remove")}
                    </button>
                    <p className="text-sm font-semibold text-primary">
                      ₪{formatIls(lineTotal(item))}
                    </p>
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
          {!orderingAllowed ? (
            <p className="mb-2 px-1 text-center text-[11px] font-medium leading-snug text-amber-200/95">
              {t("err.orderingClosed")}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 basis-[8rem]">
              <span className="text-xs text-gray-400">{t("cart.label")}</span>
              <p className="text-sm font-semibold">
                {items.length} {t("cart.items")} • ₪{formatIls(total)}
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
            {orderingAllowed ? (
              <Link
                href="/checkout"
                className="btn-primary flex min-h-[2.5rem] flex-1 items-center justify-center gap-2 text-center text-sm md:flex-none md:px-6"
              >
                <span>{t("cart.checkout")}</span>
              </Link>
            ) : (
              <span
                className="flex min-h-[2.5rem] flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-full border border-slate-700 bg-slate-800/80 px-3 text-center text-sm text-gray-500 md:flex-none md:px-6"
                aria-disabled="true"
              >
                {t("cart.checkout")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
