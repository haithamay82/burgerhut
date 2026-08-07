import { useMemo, useState } from "react";
import { formatIls } from "@/utils/cartMoney";
import { useCart } from "@/hooks/useCart";
import {
  simulateCartAfterAdd,
  pattyCartShortageMessage,
  validatePattyStockForSimulatedCart,
} from "@/utils/pattyStockClient";
import { useLocale } from "@/contexts/LocaleContext";
import { useInventory } from "@/contexts/InventoryContext";
import { useMenuCatalog } from "@/contexts/MenuCatalogContext";
import { menuItemDesc, menuItemName } from "@/utils/menuItemLabels";
import {
  MEAL_FRIES_OPTIONS,
  hasMealFriesSelection,
  mealFriesEffectiveExtraPrice,
  mealFriesI18nSuffix,
  mealFriesSelectionTotalExtra,
  sortMealFriesIds,
  sortMealFriesIdsByMenuOrder,
  toggleMealFriesIdInSelection,
} from "@/utils/mealFriesChoices";

export default function SimpleMenuItemCard({ item }) {
  const { t, locale } = useLocale();
  const { menuItems } = useMenuCatalog();
  const { addItem, items: cartItems } = useCart();
  const { isUnavailable } = useInventory();
  const isOutOfStock = isUnavailable(item.id);
  const [quantity, setQuantity] = useState(1);
  const [sellerNotes, setSellerNotes] = useState("");
  const [requestedDrinkId, setRequestedDrinkId] = useState("");
  const [drinkMenuOpen, setDrinkMenuOpen] = useState(false);
  const [mealFriesSelectedIds, setMealFriesSelectedIds] = useState(
    /** @type {string[]} */ ([])
  );
  const [isAdding, setIsAdding] = useState(false);

  const name = menuItemName(item, t, locale);
  const description = menuItemDesc(item, t, locale);

  const isShiftedCrispyImage =
    item.id === "crispy-chicken-burger-kids" ||
    item.id === "crispy-chicken-tortilla-large";

  const showSellerNotes =
    item.category !== "sides" && item.category !== "drinks";
  const drinkOptions = useMemo(
    () =>
      menuItems.filter((row) => row.category === "drinks").map((row) => ({
        id: row.id,
        label: menuItemName(row, t, locale),
        price: Number(row.basePrice) || 0,
        image: row.image,
      })),
    [menuItems, t, locale]
  );
  const mealFriesRows = useMemo(
    () =>
      MEAL_FRIES_OPTIONS.map((o) => ({
        ...o,
        label: t(`ui.mealFries.${o.id.replace(/^meal-fries-/, "")}`),
      })),
    [t]
  );
  const mealFriesPrice = useMemo(
    () => mealFriesSelectionTotalExtra(mealFriesSelectedIds),
    [mealFriesSelectedIds]
  );
  const requestedDrinkPrice = useMemo(() => {
    if (!requestedDrinkId) return 0;
    return drinkOptions.find((d) => d.id === requestedDrinkId)?.price || 0;
  }, [requestedDrinkId, drinkOptions]);
  const selectedDrink = useMemo(
    () => drinkOptions.find((d) => d.id === requestedDrinkId) || null,
    [drinkOptions, requestedDrinkId]
  );
  const finalUnitPrice =
    (Number(item.basePrice) || 0) + mealFriesPrice + requestedDrinkPrice;

  const handleAdd = async () => {
    if (isOutOfStock) return;
    if (showSellerNotes && !hasMealFriesSelection(mealFriesSelectedIds)) {
      if (typeof window !== "undefined") {
        window.alert(t("ui.mealFriesValidate"));
      }
      return;
    }
    const notesTrim = showSellerNotes ? sellerNotes.trim() : "";
    const requestedDrinkLabel =
      showSellerNotes && requestedDrinkId
        ? menuItemName(
            menuItems.find((r) => r.id === requestedDrinkId) || {
              id: requestedDrinkId,
            },
            t,
            locale
          )
        : "";
    const mfIds = sortMealFriesIdsByMenuOrder(mealFriesSelectedIds);
    const mfIdsForPrice = sortMealFriesIds(mealFriesSelectedIds);
    const mealFriesChoices = mfIds.map((id) => ({
      id,
      label: t(`ui.mealFries.${mealFriesI18nSuffix(id)}`),
      price: mealFriesEffectiveExtraPrice(id, mfIdsForPrice),
    }));
    const mfPriceSum = mealFriesSelectionTotalExtra(mealFriesSelectedIds);
    const mealFriesLabel = mfIds
      .map((id) => t(`ui.mealFries.${mealFriesI18nSuffix(id)}`))
      .join(", ");
    const linePayload = {
      productId: item.id,
      name,
      menuCategory: item.category,
      salads: [],
      toppings: [],
      extras: [],
      quantity,
      price: finalUnitPrice,
      ...(showSellerNotes
        ? {
            mealFriesChoices,
            mealFriesChoiceId: mfIds[0] || "",
            mealFriesLabel,
            mealFriesPrice: mfPriceSum,
          }
        : {}),
      ...(showSellerNotes && requestedDrinkId
        ? { requestedDrinkId, requestedDrinkLabel, requestedDrinkPrice }
        : {}),
      ...(notesTrim ? { sellerNotes: notesTrim } : {}),
    };
    const afterMerge = simulateCartAfterAdd(cartItems, linePayload);
    const pattyCheck = await validatePattyStockForSimulatedCart(
      afterMerge,
      item.id
    );
    if (!pattyCheck.ok) {
      if (typeof window !== "undefined") {
        window.alert(pattyCartShortageMessage(t, pattyCheck));
      }
      return;
    }
    setIsAdding(true);
    addItem(linePayload);
    setQuantity(1);
    setSellerNotes("");
    setRequestedDrinkId("");
    setMealFriesSelectedIds([]);
    setDrinkMenuOpen(false);
    setTimeout(() => setIsAdding(false), 300);
  };

  return (
    <div className="card min-w-0 max-w-full overflow-hidden">
      <div className="flex gap-3 p-3">
        <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-bh-border">
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
          <p className="line-clamp-3 text-xs text-bh-faint">{description}</p>
          <p className="mt-1 text-sm font-semibold text-primary">
            ₪{formatIls(finalUnitPrice * quantity)}
          </p>
        </div>
      </div>
      {showSellerNotes ? (
        <div
          className={`space-y-1.5 border-t border-bh-border p-3 text-xs ${
            isOutOfStock ? "pointer-events-none opacity-45" : ""
          }`}
        >
          <div className="mb-2 space-y-1.5">
            <div>
              <p className="text-[11px] font-semibold text-bh-muted">
                {t("ui.mealFriesForMealLabel")}
              </p>
              <p className="mt-0.5 text-[10px] text-bh-faint">
                {t("ui.mealFriesMultiHint")}
              </p>
            </div>
            <div
              id={`meal-fries-${item.id}`}
              className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
            >
              {mealFriesRows.map((opt) => {
                const selected = sortMealFriesIds(mealFriesSelectedIds).includes(
                  opt.id
                );
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() =>
                      setMealFriesSelectedIds((prev) =>
                        toggleMealFriesIdInSelection(prev, opt.id)
                      )
                    }
                    className={`flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-start text-[10px] ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-bh-border-strong text-bh-muted"
                    } ${isOutOfStock ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    {opt.image ? (
                      <img
                        src={opt.image}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-md border border-bh-border-strong object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="h-7 w-7 shrink-0 rounded-md border border-bh-border-strong bg-bh-elevated"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1 leading-snug">
                      {opt.label}
                    </span>
                    <span className="shrink-0 text-[9px] text-bh-faint tabular-nums">
                      +₪
                      {formatIls(
                        mealFriesEffectiveExtraPrice(opt.id, mealFriesSelectedIds)
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <label
            htmlFor={`requested-drink-${item.id}`}
            className="block text-[11px] font-semibold text-bh-muted"
          >
            {t("ui.addDrinkQuestion")}
          </label>
          <div id={`requested-drink-${item.id}`} className="relative mb-2">
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={() => {
                setDrinkMenuOpen((v) => !v);
              }}
              className="flex w-full items-center justify-between rounded-lg border border-bh-border-strong bg-bh-card px-2 py-1.5 text-[11px] text-bh-text outline-none transition-colors hover:border-primary disabled:opacity-50"
            >
              <span className="truncate">
                {selectedDrink
                  ? `${selectedDrink.label} (+₪${formatIls(selectedDrink.price)})`
                  : t("ui.addDrinkSelectPlaceholder")}
              </span>
              <span className="text-[10px] text-bh-faint">
                {drinkMenuOpen ? "▲" : "▼"}
              </span>
            </button>
            {drinkMenuOpen ? (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-bh-border-strong bg-bh-elevated/95 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setRequestedDrinkId("");
                    setDrinkMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between border-b border-bh-border px-2 py-1.5 text-[11px] text-bh-muted hover:bg-bh-card"
                >
                  <span>{t("ui.addDrinkSelectPlaceholder")}</span>
                </button>
                {drinkOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setRequestedDrinkId(opt.id);
                      setDrinkMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-2 py-1.5 text-[11px] hover:bg-bh-card ${
                      requestedDrinkId === opt.id
                        ? "bg-primary/10 text-primary"
                        : "text-bh-text"
                    }`}
                  >
                    <span className="text-[10px] text-bh-muted">
                      +₪{formatIls(opt.price)}
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{opt.label}</span>
                      <img
                        src={opt.image}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-md border border-bh-border-strong object-cover"
                        loading="lazy"
                      />
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <label
            htmlFor={`seller-notes-${item.id}`}
            className="block text-[11px] font-semibold text-bh-muted"
          >
            {t("ui.sellerNotes")}
          </label>
          <textarea
            id={`seller-notes-${item.id}`}
            value={sellerNotes}
            onChange={(e) => setSellerNotes(e.target.value)}
            rows={2}
            maxLength={500}
            disabled={isOutOfStock}
            placeholder={t("ui.sellerNotesPh")}
            className="mb-2 w-full resize-y rounded-lg border border-bh-border-strong bg-bh-card px-2 py-1.5 text-[11px] text-bh-text outline-none placeholder:text-bh-faint focus:border-primary disabled:opacity-50"
          />
        </div>
      ) : null}
      <div
        className={`flex items-center justify-between gap-2 border-t border-bh-border p-3 text-xs ${
          isOutOfStock ? "pointer-events-none opacity-45" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={isOutOfStock}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-bh-border-strong text-lg leading-none disabled:opacity-50"
          >
            −
          </button>
          <span className="w-6 text-center text-sm">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            disabled={isOutOfStock}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-bh-border-strong text-lg leading-none disabled:opacity-50"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={isAdding || isOutOfStock}
          className="btn-primary flex-1 text-xs disabled:opacity-50"
        >
          {isAdding ? t("ui.added") : t("ui.addToCart")}
        </button>
      </div>
    </div>
  );
}
