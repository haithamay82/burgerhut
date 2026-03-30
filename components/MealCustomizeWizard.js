import { useState, useMemo, useEffect, useCallback } from "react";
import {
  BURGER_TOPPINGS,
  CRISPY_CHICKEN_BURGER_PRODUCT_ID,
  CRISPY_CHICKEN_KIDS_PRODUCT_ID,
  CRISPY_MEAL_TOPPINGS,
  EXTRA_SAUCES,
  FREE_SALADS,
  KIDS_CRISPY_BREAD_CHOICES,
} from "@/utils/menuData";
import { formatIls } from "@/utils/cartMoney";
import { computeSaucesCharge, marginalSauceCharge } from "@/utils/saucePricing";
import { useCart } from "@/hooks/useCart";
import { useLocale } from "@/contexts/LocaleContext";
import { useInventory } from "@/contexts/InventoryContext";
import { useOrderingHours } from "@/contexts/OrderingHoursContext";

export default function MealCustomizeWizard({ item, open, onClose }) {
  const { t } = useLocale();
  const { orderingAllowed } = useOrderingHours();
  const { addItem } = useCart();
  const { isUnavailable, unavailableIds } = useInventory();

  const [selectedSalads, setSelectedSalads] = useState([]);
  const [selectedToppings, setSelectedToppings] = useState([]);
  const [selectedSauces, setSelectedSauces] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [kidsBreadChoice, setKidsBreadChoice] = useState("round");
  const [adultCrispyBli, setAdultCrispyBli] = useState(false);
  const [sellerNotes, setSellerNotes] = useState("");

  const isOutOfStock = item ? isUnavailable(item.id) : false;
  const orderingClosed = !orderingAllowed;
  const blocked = isOutOfStock || orderingClosed;
  const isKidsCrispyBurger = item?.id === CRISPY_CHICKEN_KIDS_PRODUCT_ID;
  const isAdultCrispyBurger = item?.id === CRISPY_CHICKEN_BURGER_PRODUCT_ID;
  const toppingChoices =
    item?.category === "crispy" ? CRISPY_MEAL_TOPPINGS : BURGER_TOPPINGS;

  const toppingsPrice = selectedToppings.reduce(
    (sum, id) =>
      sum + (toppingChoices.find((x) => x.id === id)?.price || 0),
    0
  );

  const { total: saucesPrice, details: sauceChargeDetails } = useMemo(
    () => computeSaucesCharge(selectedSauces),
    [selectedSauces]
  );

  const unitPrice = item
    ? (Number(item.basePrice) || 0) + toppingsPrice + saucesPrice
    : 0;

  useEffect(() => {
    if (!open || !item) return;
    setSelectedSalads([]);
    setSelectedToppings([]);
    setSelectedSauces([]);
    setQuantity(1);
    setKidsBreadChoice("round");
    setAdultCrispyBli(false);
    setSellerNotes("");
    setIsAdding(false);
  }, [open, item?.id]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) return;
    setSelectedToppings((prev) => prev.filter((id) => !isUnavailable(id)));
  }, [open, unavailableIds, isUnavailable]);

  const toggleToppingChoice = (id) => {
    if (blocked) return;
    const unavail = isUnavailable(id);
    if (unavail && !selectedToppings.includes(id)) return;
    setSelectedToppings((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleInList = (id, list, setList) => {
    if (blocked) return;
    setList((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  /** מחיר היחידה הבאה אם לוחצים + (לפי סדר הרשימה הנוכחי). */
  const sauceNextUnitSuffix = (sauceId) => {
    const marginal = marginalSauceCharge(sauceId, selectedSauces);
    if (marginal === 0) return "";
    return `${t("ui.saucePlus")}${marginal}`;
  };

  const sauceCount = (sauceId) =>
    selectedSauces.filter((s) => s === sauceId).length;

  const addSauce = (id) => {
    if (blocked) return;
    setSelectedSauces((prev) => [...prev, id]);
  };

  const removeSauce = (id) => {
    if (blocked) return;
    setSelectedSauces((prev) => {
      const idx = prev.lastIndexOf(id);
      if (idx === -1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleAdd = () => {
    if (!item || blocked) return;
    setIsAdding(true);
    const name = t(`menu.${item.id}.name`);
    const salads = selectedSalads.map((id) => ({
      id,
      label: t(`salad.${id}`),
      price: 0,
    }));
    const toppings = selectedToppings.map((id) => ({
      id,
      label: t(`topping.${id}`),
      price: toppingChoices.find((x) => x.id === id)?.price,
    }));
    const extras = sauceChargeDetails.map((row) => ({
      id: row.id,
      label: t(`sauce.${row.id}`),
      price: row.charge,
    }));
    let variantLabel;
    if (isKidsCrispyBurger) {
      variantLabel = t(`ui.kidsCrispyBread.${kidsBreadChoice}`);
    } else if (isAdultCrispyBurger && adultCrispyBli) {
      variantLabel = t("ui.adultCrispyNoRound");
    }

    const notesTrim = sellerNotes.trim();
    addItem({
      productId: item.id,
      name,
      salads,
      toppings,
      extras,
      quantity,
      price: unitPrice,
      ...(variantLabel ? { variantLabel } : {}),
      ...(notesTrim ? { sellerNotes: notesTrim } : {}),
    });
    setTimeout(() => {
      setIsAdding(false);
      handleClose();
    }, 250);
  };

  if (!open || !item) return null;

  const name = t(`menu.${item.id}.name`);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/95 text-gray-100 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meal-wizard-title"
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-800 bg-slate-950/90 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2
            id="meal-wizard-title"
            className="truncate text-base font-bold text-primary"
          >
            {name}
          </h2>
          <p className="mt-1 text-[11px] leading-snug text-gray-500">
            {t("ui.wizardAllOnOneScreen")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="shrink-0 rounded-full border border-slate-600 px-3 py-1.5 text-xs text-gray-300 hover:border-slate-400"
        >
          {t("ui.wizardClose")}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isOutOfStock ? (
          <p className="mb-4 text-base font-extrabold text-red-500">
            {t("ui.outOfStock")}
          </p>
        ) : null}
        {orderingClosed && !isOutOfStock ? (
          <p className="mb-4 text-sm font-semibold text-amber-200/90">
            {t("err.orderingClosed")}
          </p>
        ) : null}

        {isKidsCrispyBurger ? (
          <section className="mb-6 space-y-2 text-xs">
            <h3 className="text-[11px] font-semibold text-gray-300">
              {t("ui.kidsCrispyBread.title")}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {KIDS_CRISPY_BREAD_CHOICES.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => setKidsBreadChoice(opt.id)}
                  className={`rounded-full border px-2.5 py-2 text-[11px] ${
                    kidsBreadChoice === opt.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-slate-700 text-gray-300"
                  }`}
                >
                  {t(`ui.kidsCrispyBread.${opt.id}`)}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {isAdultCrispyBurger ? (
          <section className="mb-6 space-y-2 text-xs">
            <h3 className="text-[11px] font-semibold text-gray-300">
              {t("ui.wizardServingTitle")}
            </h3>
            <button
              type="button"
              disabled={blocked}
              onClick={() => setAdultCrispyBli((v) => !v)}
              className={`rounded-full border px-3 py-2 text-[11px] ${
                adultCrispyBli
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-700 text-gray-300"
              }`}
            >
              {t("ui.adultCrispyNoRound")}
            </button>
          </section>
        ) : null}

        <section className="mb-6 space-y-2 text-xs">
          <h3 className="text-[11px] font-semibold text-gray-300">
            {t("ui.freeSalads")}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {FREE_SALADS.map((x) => (
              <label
                key={x.id}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1.5 text-[11px] ${
                  selectedSalads.includes(x.id)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-700 text-gray-300"
                }`}
              >
                {x.image ? (
                  <img
                    src={x.image}
                    alt={t(`salad.${x.id}`)}
                    className="h-8 w-8 shrink-0 rounded-md border border-slate-700 object-cover"
                  />
                ) : null}
                <span className="min-w-0 flex-1 leading-snug">
                  {t(`salad.${x.id}`)}
                </span>
                <input
                  type="checkbox"
                  className="hidden"
                  checked={selectedSalads.includes(x.id)}
                  onChange={() =>
                    toggleInList(x.id, selectedSalads, setSelectedSalads)
                  }
                />
              </label>
            ))}
          </div>
        </section>

        <section className="mb-6 space-y-2 text-xs">
          <h3 className="text-[11px] font-semibold text-gray-300">
            {t("ui.burgerToppings")}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {toppingChoices.map((x) => {
              const topUnavail = isUnavailable(x.id);
              const selected = selectedToppings.includes(x.id);
              const rowBlocked = topUnavail && !selected;
              return (
                <label
                  key={x.id}
                  className={`flex items-center justify-between gap-1.5 rounded-full border px-2 py-1.5 text-[11px] ${
                    rowBlocked
                      ? "cursor-not-allowed border-slate-800 text-gray-500 opacity-60"
                      : "cursor-pointer"
                  } ${
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : rowBlocked
                        ? ""
                        : "border-slate-700 text-gray-300"
                  }`}
                >
                  {x.image ? (
                    <img
                      src={x.image}
                      alt={t(`topping.${x.id}`)}
                      className="h-8 w-8 shrink-0 rounded-md border border-slate-700 object-cover"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 pr-1 leading-snug">
                    {t(`topping.${x.id}`)}
                    {topUnavail ? (
                      <span className="mr-1 text-[10px] text-amber-600/90">
                        ({t("ui.soldOutShort")})
                      </span>
                    ) : null}
                  </span>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={selected}
                    onChange={() => toggleToppingChoice(x.id)}
                  />
                  <span className="shrink-0 text-[10px] text-gray-400">
                    +₪{x.price}
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="mb-4 space-y-2 text-xs">
          <h3 className="text-[11px] font-semibold text-gray-300">
            {t("ui.extraSauces")}
          </h3>
          <p className="text-[10px] leading-snug text-gray-500">
            {t("ui.saucePricingHint")}
          </p>
          <div className="grid grid-cols-1 gap-2">
            {EXTRA_SAUCES.map((x) => {
              const cnt = sauceCount(x.id);
              return (
                <div
                  key={x.id}
                  className={`grid w-full grid-cols-[1fr_auto_1fr] items-center gap-x-2 rounded-full border px-1.5 py-1.5 text-[11px] ${
                    cnt > 0
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-slate-700 text-gray-300"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-1.5 justify-self-start">
                    {x.image ? (
                      <img
                        src={x.image}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-md border border-slate-700 object-cover"
                      />
                    ) : null}
                    <span className="min-w-0 text-end leading-snug">
                      {t(`sauce.${x.id}`)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 justify-self-center">
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => addSauce(x.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 text-sm leading-none text-gray-200 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={t("ui.sauceAddOne")}
                    >
                      +
                    </button>
                    <span
                      className="min-w-[1.25rem] text-center text-[12px] font-semibold tabular-nums"
                      aria-live="polite"
                    >
                      {cnt}
                    </span>
                    <button
                      type="button"
                      disabled={blocked || cnt === 0}
                      onClick={() => removeSauce(x.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 text-sm leading-none text-gray-200 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={t("ui.sauceRemoveOne")}
                    >
                      −
                    </button>
                  </div>
                  <div className="flex min-h-[1.25rem] min-w-0 items-center justify-self-end">
                    <span className="w-full min-w-[2.25rem] text-end text-[10px] leading-tight text-gray-400">
                      {sauceNextUnitSuffix(x.id)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="mb-4 space-y-1.5">
          <label
            htmlFor="meal-seller-notes"
            className="block text-[11px] font-semibold text-gray-300"
          >
            {t("ui.sellerNotes")}
          </label>
          <textarea
            id="meal-seller-notes"
            value={sellerNotes}
            onChange={(e) => setSellerNotes(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={blocked}
            placeholder={t("ui.sellerNotesPh")}
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-primary disabled:opacity-50"
          />
        </div>

        <p className="mb-4 text-sm text-gray-400">
          {t("ui.wizardPriceLine")}{" "}
          <span className="font-bold text-primary">
            ₪{formatIls(unitPrice)}
          </span>
          {quantity > 1 ? (
            <span className="mr-1 text-gray-500">
              {" "}
              × {quantity} = ₪{formatIls(unitPrice * quantity)}
            </span>
          ) : null}
        </p>
      </div>

      <footer className="shrink-0 border-t border-slate-800 bg-slate-950/95 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center justify-center gap-3 sm:justify-start">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={blocked}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-lg leading-none disabled:opacity-50"
            >
              −
            </button>
            <span className="w-8 text-center text-lg font-semibold">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              disabled={blocked}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-lg leading-none disabled:opacity-50"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={isAdding || blocked}
            className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50"
          >
            {isAdding ? t("ui.added") : t("ui.addToCart")}
          </button>
        </div>
      </footer>
    </div>
  );
}
