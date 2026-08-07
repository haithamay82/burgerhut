import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  BURGER_DONENESS_OPTIONS,
  CRISPY_CHICKEN_BURGER_PRODUCT_ID,
  CRISPY_CHICKEN_KIDS_PRODUCT_ID,
  DEFAULT_BURGER_DONENESS_ID,
  DOUBLE_CHEESE_TOPPING_IDS,
  EXTRA_SAUCES,
  KIDS_CRISPY_BREAD_CHOICES,
  mealSaladChoicesForCategory,
  INVENTORY_MANAGED_SALAD_IDS,
  NO_SALADS_CHOICE,
  NO_SALADS_CHOICE_ID,
} from "@/utils/menuData";
import { isBeefBurgerStyleCategory } from "@/utils/menuMealCategories";
import {
  defaultSaladsForSpecialProductId,
  specialPattyGramsDefaultForStock,
  SPECIAL_PATTY_220_EXTRA_NIS,
} from "@/utils/specialBurgerDefaults";
import {
  canBuildBurgerWithPattyStock,
  SPECIAL_LETTUCE_BURGER_ID,
} from "@/utils/burgerPattyPrep";
import { useMenuCatalog } from "@/contexts/MenuCatalogContext";
import { menuItemName, toppingDisplayName } from "@/utils/menuItemLabels";
import { formatIls } from "@/utils/cartMoney";
import { computeSaucesCharge, marginalSauceCharge } from "@/utils/saucePricing";
import { useCart, customizationKey } from "@/hooks/useCart";
import {
  simulateCartAfterAdd,
  pattyCartShortageMessage,
  validatePattyStockForSimulatedCart,
} from "@/utils/pattyStockClient";
import { useLocale } from "@/contexts/LocaleContext";
import { useInventory } from "@/contexts/InventoryContext";
import {
  MEAL_FRIES_OPTIONS,
  hasMealFriesSelection,
  mealFriesEffectiveExtraPrice,
  mealFriesI18nSuffix,
  mealFriesSelectionTotalExtra,
  normalizeMealFriesChoicesFromLine,
  sortMealFriesIds,
  sortMealFriesIdsByMenuOrder,
  toggleMealFriesIdInSelection,
} from "@/utils/mealFriesChoices";
/** סימון ב-history.state כדי שכפתור «חזור» במכשיר יסגור את הוויזארד */
const MEAL_WIZARD_HISTORY_KEY = "__burgerhutMealWizard";

const MEAL_VALIDATE_I18N = {
  salads: "ui.mealValidateSalads",
  sauces: "ui.mealValidateSauces",
  fries: "ui.mealValidateFries",
};

/**
 * @param {string[]} selectedSalads
 * @param {string[]} selectedSauces
 * @param {string[]} mealFriesSelectedIds
 * @returns {("salads"|"sauces"|"fries")[]}
 */
function computeMissingMealSelections(
  selectedSalads,
  selectedSauces,
  mealFriesSelectedIds
) {
  const missing = /** @type {("salads"|"sauces"|"fries")[]} */ ([]);
  if (!selectedSalads.length) missing.push("salads");
  if (!selectedSauces.length) missing.push("sauces");
  if (!hasMealFriesSelection(mealFriesSelectedIds)) missing.push("fries");
  return missing;
}

export default function MealCustomizeWizard({
  item,
  open,
  onClose,
  initialCartLine = null,
  replaceLineId = null,
  specialWizardMode = null,
}) {
  const { t, locale } = useLocale();
  const { menuItems, burgerToppings, crispyMealToppings } = useMenuCatalog();
  const { addItem, replaceCartLine, items: cartItems } = useCart();
  const { isUnavailable, unavailableIds, pattyStock } = useInventory();

  const [selectedSalads, setSelectedSalads] = useState([]);
  const [selectedToppings, setSelectedToppings] = useState([]);
  const [selectedSauces, setSelectedSauces] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [mealValidateOpen, setMealValidateOpen] = useState(false);
  const [mealValidateMissing, setMealValidateMissing] = useState(
    /** @type {("salads"|"sauces")[]} */ ([])
  );
  const [kidsBreadChoice, setKidsBreadChoice] = useState("round");
  const [adultCrispyBli, setAdultCrispyBli] = useState(false);
  const [sellerNotes, setSellerNotes] = useState("");
  const [requestedDrinkId, setRequestedDrinkId] = useState("");
  const [drinkMenuOpen, setDrinkMenuOpen] = useState(false);
  const [mealFriesSelectedIds, setMealFriesSelectedIds] = useState(
    /** @type {string[]} */ ([])
  );
  const [donenessId, setDonenessId] = useState(DEFAULT_BURGER_DONENESS_ID);
  /** רוטב על הלחמניה — ברירת מחדל כן */
  const [bunSauceOnBun, setBunSauceOnBun] = useState(true);
  /** cheddar/gouda: 1 = שכבה אחת, 2 = דבל */
  const [cheeseMode, setCheeseMode] = useState({});
  /** מנות מיוחדים — משקל קציצה בודדת */
  const [specialPattyGrams, setSpecialPattyGrams] = useState(200);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  /** true אחרי pushState — עד ש-popstate (חזור) או ניקוי אחרי סגירה מ-X */
  const wizardHistoryPending = useRef(false);

  const isOutOfStock = item ? isUnavailable(item.id) : false;
  const blocked = isOutOfStock;
  const isKidsCrispyBurger = item?.id === CRISPY_CHICKEN_KIDS_PRODUCT_ID;
  const isAdultCrispyBurger = item?.id === CRISPY_CHICKEN_BURGER_PRODUCT_ID;
  const toppingChoices = useMemo(() => {
    if (!item) return [];
    if (item.category === "crispy") return crispyMealToppings;
    if (item.category === "specials") {
      return burgerToppings.filter((row) => !DOUBLE_CHEESE_TOPPING_IDS.has(row.id));
    }
    return burgerToppings;
  }, [item, burgerToppings, crispyMealToppings]);
  const isBeefBurgerMeal = isBeefBurgerStyleCategory(item?.category);
  const isSpecialMealCat = item?.category === "specials";
  const isSpecialCheeseBomb = item?.id === "special-cheese-bomb";
  const isSpecialLettuceBurger = item?.id === SPECIAL_LETTUCE_BURGER_ID;

  const specialCanPatty200 = useMemo(() => {
    if (
      !item?.id ||
      item.category !== "specials" ||
      isSpecialCheeseBomb ||
      isSpecialLettuceBurger
    )
      return true;
    if (!pattyStock || typeof pattyStock !== "object") return true;
    return canBuildBurgerWithPattyStock(pattyStock, item.id, 1, 200);
  }, [
    item?.id,
    item?.category,
    isSpecialCheeseBomb,
    isSpecialLettuceBurger,
    pattyStock,
  ]);

  const specialCanPatty220 = useMemo(() => {
    if (
      !item?.id ||
      item.category !== "specials" ||
      isSpecialCheeseBomb ||
      isSpecialLettuceBurger
    )
      return true;
    if (!pattyStock || typeof pattyStock !== "object") return true;
    return canBuildBurgerWithPattyStock(pattyStock, item.id, 1, 220);
  }, [
    item?.id,
    item?.category,
    isSpecialCheeseBomb,
    isSpecialLettuceBurger,
    pattyStock,
  ]);

  /** מנות מיוחדות — מצב ישן «רק סלטים» (כיום לא בשימוש אחרי פתיחת וויזארד מלא) */
  const isSpecialRestrictedWizard =
    isSpecialMealCat && specialWizardMode === "editSalads";
  /** רוטב על לחמניה: מוסתר בקריספי מבוגרים עם «בלי עגולה», ובקריספי ילדים עם «בלי לחם»; במנות מיוחדים — לא מוצג */
  const showBunSauceOnMeal =
    !isSpecialRestrictedWizard &&
    (!isAdultCrispyBurger || !adultCrispyBli) &&
    (!isKidsCrispyBurger || kidsBreadChoice !== "none");

  const toppingsPrice = isSpecialRestrictedWizard
    ? 0
    : selectedToppings.reduce(
        (sum, id) =>
          sum + (toppingChoices.find((x) => x.id === id)?.price || 0),
        0
      ) +
      (item?.category === "specials"
        ? 0
        : [...DOUBLE_CHEESE_TOPPING_IDS].reduce((sum, cheeseId) => {
            const layers = cheeseMode[cheeseId];
            if (!layers) return sum;
            const p = toppingChoices.find((x) => x.id === cheeseId)?.price || 0;
            return sum + p * layers;
          }, 0));

  const { total: saucesPrice, details: sauceChargeDetails } = useMemo(
    () => computeSaucesCharge(selectedSauces),
    [selectedSauces]
  );

  const saladChoicesList = useMemo(
    () => (item ? mealSaladChoicesForCategory(item.category) : []),
    [item]
  );

  const saladsPrice = useMemo(
    () =>
      selectedSalads.reduce((sum, id) => {
        if (id === NO_SALADS_CHOICE_ID) return sum;
        return (
          sum +
          (Number(saladChoicesList.find((r) => r.id === id)?.price) || 0)
        );
      }, 0),
    [selectedSalads, saladChoicesList]
  );

  const noSaladsSelected = selectedSalads.includes(NO_SALADS_CHOICE_ID);

  const toggleSaladChoice = (id) => {
    if (blocked) return;
    if (id === NO_SALADS_CHOICE_ID) {
      setSelectedSalads((prev) =>
        prev.includes(NO_SALADS_CHOICE_ID) ? [] : [NO_SALADS_CHOICE_ID]
      );
      return;
    }
    setSelectedSalads((prev) => {
      const withoutNone = prev.filter((x) => x !== NO_SALADS_CHOICE_ID);
      return withoutNone.includes(id)
        ? withoutNone.filter((x) => x !== id)
        : [...withoutNone, id];
    });
  };

  const specialPattyUpcharge =
    item?.category === "specials" &&
    !isSpecialCheeseBomb &&
    !isSpecialLettuceBurger &&
    Number(specialPattyGrams) === 220
      ? SPECIAL_PATTY_220_EXTRA_NIS
      : 0;

  const unitPrice = item
    ? (Number(item.basePrice) || 0) +
      toppingsPrice +
      saucesPrice +
      saladsPrice +
      specialPattyUpcharge
    : 0;
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
  const finalUnitPrice = unitPrice + mealFriesPrice + requestedDrinkPrice;

  const editHydrateKey = useMemo(() => {
    if (!replaceLineId || !initialCartLine) return "";
    try {
      return `${replaceLineId}|${customizationKey(initialCartLine)}`;
    } catch {
      return String(replaceLineId);
    }
  }, [replaceLineId, initialCartLine]);

  const specialFixedMealToppingsText = useMemo(() => {
    if (!item?.id) return "";
    const key = `menu.${item.id}.fixedMealToppings`;
    const v = t(key);
    return v === key ? "" : String(v).trim();
  }, [item?.id, t]);

  useEffect(() => {
    if (!open || !item) return;
    const editing = Boolean(replaceLineId && initialCartLine);
    if (editing) {
      const line = initialCartLine;
      setQuantity(Math.max(1, Number(line.quantity) || 1));
      {
        const saladIds = [
          ...(line.salads || []).map((s) => s.id).filter(Boolean),
        ].filter((id) => id !== NO_SALADS_CHOICE_ID);
        setSelectedSalads(
          saladIds.length ? saladIds : [NO_SALADS_CHOICE_ID]
        );
      }
      setSelectedSauces([...(line.extras || []).map((e) => e.id).filter(Boolean)]);
      const topsFromLine = line.toppings || [];
      const nextCheese = {};
      const nextPlain = [];
      for (const top of topsFromLine) {
        const id = top?.id;
        if (!id) continue;
        if (DOUBLE_CHEESE_TOPPING_IDS.has(id)) {
          nextCheese[id] = top.layers === 2 ? 2 : 1;
        } else {
          nextPlain.push(id);
        }
      }
      if (item.category === "specials") {
        setCheeseMode({});
        setSelectedToppings(
          nextPlain.filter((id) => !DOUBLE_CHEESE_TOPPING_IDS.has(id))
        );
      } else {
        setCheeseMode(nextCheese);
        setSelectedToppings(nextPlain);
      }
      setKidsBreadChoice(
        line.kidsBreadChoice && typeof line.kidsBreadChoice === "string"
          ? line.kidsBreadChoice
          : "round"
      );
      setAdultCrispyBli(
        typeof line.adultCrispyBli === "boolean"
          ? line.adultCrispyBli
          : line.name === t("menu.crispy-chicken-burger.lineNameNoRound")
      );
      setDonenessId(
        String(line.burgerDoneness?.id || "").trim() ||
          DEFAULT_BURGER_DONENESS_ID
      );
      if (typeof line.bunSauceOnBun === "boolean") {
        setBunSauceOnBun(line.bunSauceOnBun);
      } else {
        setBunSauceOnBun(true);
      }
      setRequestedDrinkId(String(line.requestedDrinkId || "").trim());
      setMealFriesSelectedIds(
        normalizeMealFriesChoicesFromLine(line).map((c) => c.id)
      );
      setSellerNotes(String(line.sellerNotes || ""));
      if (item.category === "specials") {
        if (item.id === SPECIAL_LETTUCE_BURGER_ID) {
          setSpecialPattyGrams(160);
        } else {
          setSpecialPattyGrams(
            Number(line.specialPattyGrams) === 220 ? 220 : 200
          );
        }
      } else {
        setSpecialPattyGrams(200);
      }
      setDrinkMenuOpen(false);
      setIsAdding(false);
      setMealValidateOpen(false);
      setMealValidateMissing([]);
      return;
    }
    setSelectedSalads(
      item.category === "specials"
        ? defaultSaladsForSpecialProductId(item.id)
        : []
    );
    setSelectedToppings([]);
    setSelectedSauces([]);
    setQuantity(1);
    setKidsBreadChoice("round");
    setAdultCrispyBli(false);
    setSellerNotes("");
    setRequestedDrinkId("");
    setMealFriesSelectedIds([]);
    setDrinkMenuOpen(false);
    setIsAdding(false);
    setDonenessId(DEFAULT_BURGER_DONENESS_ID);
    setBunSauceOnBun(true);
    setCheeseMode({});
    setSpecialPattyGrams(
      item.category === "specials"
        ? specialPattyGramsDefaultForStock(item.id, pattyStock)
        : 200
    );
    setMealValidateOpen(false);
    setMealValidateMissing([]);
  }, [open, item?.id, item?.category, editHydrateKey, specialWizardMode, pattyStock, t]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !item || typeof window === "undefined") return;

    const onPopState = () => {
      wizardHistoryPending.current = false;
      onCloseRef.current();
    };

    const prevState = window.history.state;
    const merged =
      prevState != null &&
      typeof prevState === "object" &&
      !Array.isArray(prevState)
        ? { ...prevState, [MEAL_WIZARD_HISTORY_KEY]: 1 }
        : { [MEAL_WIZARD_HISTORY_KEY]: 1 };
    window.history.pushState(merged, "");
    wizardHistoryPending.current = true;
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      if (
        wizardHistoryPending.current &&
        window.history.state?.[MEAL_WIZARD_HISTORY_KEY]
      ) {
        wizardHistoryPending.current = false;
        window.history.back();
      }
    };
  }, [open, item?.id]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (mealValidateOpen) {
        e.preventDefault();
        setMealValidateOpen(false);
        setMealValidateMissing([]);
        return;
      }
      handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose, mealValidateOpen]);

  useEffect(() => {
    if (!open) return;
    setSelectedToppings((prev) => prev.filter((id) => !isUnavailable(id)));
    setCheeseMode((prev) => {
      const next = { ...prev };
      for (const id of DOUBLE_CHEESE_TOPPING_IDS) {
        if (isUnavailable(id)) delete next[id];
      }
      return next;
    });
  }, [open, unavailableIds, isUnavailable]);

  const toggleToppingChoice = (id) => {
    if (blocked) return;
    if (DOUBLE_CHEESE_TOPPING_IDS.has(id)) return;
    const unavail = isUnavailable(id);
    if (unavail && !selectedToppings.includes(id)) return;
    setSelectedToppings((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleCheeseRow = (id) => {
    if (blocked) return;
    const unavail = isUnavailable(id);
    setCheeseMode((prev) => {
      const cur = prev[id];
      if (!cur) {
        if (unavail) return prev;
        return { ...prev, [id]: 1 };
      }
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const toggleCheeseDouble = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (blocked) return;
    setCheeseMode((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: cur === 2 ? 1 : 2 };
    });
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

  const performAddToCart = async () => {
    if (!item || blocked) return;
    if (!hasMealFriesSelection(mealFriesSelectedIds)) {
      setMealValidateMissing(["fries"]);
      setMealValidateOpen(true);
      return;
    }
    let name;
    if (isAdultCrispyBurger) {
      name = adultCrispyBli
        ? t("menu.crispy-chicken-burger.lineNameNoRound")
        : t("menu.crispy-chicken-burger.lineNameRound");
    } else if (isKidsCrispyBurger) {
      const kidNames = {
        round: "menu.crispy-chicken-burger-kids.lineNameRoundSmall",
        small_tortilla: "menu.crispy-chicken-burger-kids.lineNameSmallTortilla",
        none: "menu.crispy-chicken-burger-kids.lineNameNoBread",
      };
      name = t(kidNames[kidsBreadChoice] || kidNames.round);
    } else {
      name = menuItemName(item, t, locale);
    }
    const salads = selectedSalads
      .filter((id) => id && id !== NO_SALADS_CHOICE_ID)
      .map((id) => {
        const p =
          Number(
            mealSaladChoicesForCategory(item.category).find((r) => r.id === id)
              ?.price
          ) || 0;
        return {
          id,
          label: t(`salad.${id}`),
          price: p,
        };
      });
    const doubleWord = t("ui.doubleWord");
    const toppings = [];
    if (item.category === "specials") {
      if (!isSpecialCheeseBomb) {
        for (const id of selectedToppings) {
          const row = toppingChoices.find((x) => x.id === id);
          toppings.push({
            id,
            label: row ? toppingDisplayName(row, t, locale) : t(`topping.${id}`),
            price: row?.price,
          });
        }
      }
    } else {
      for (const cheeseId of DOUBLE_CHEESE_TOPPING_IDS) {
        const layers = cheeseMode[cheeseId];
        if (!layers) continue;
        const cheeseRow = toppingChoices.find((x) => x.id === cheeseId);
        const p = cheeseRow?.price || 0;
        const baseLabel = cheeseRow
          ? toppingDisplayName(cheeseRow, t, locale)
          : t(`topping.${cheeseId}`);
        toppings.push({
          id: cheeseId,
          label:
            layers === 2 ? `${baseLabel} ${doubleWord}` : baseLabel,
          price: p * layers,
          ...(layers === 2 ? { layers: 2 } : {}),
        });
      }
      for (const id of selectedToppings) {
        const row = toppingChoices.find((x) => x.id === id);
        toppings.push({
          id,
          label: row ? toppingDisplayName(row, t, locale) : t(`topping.${id}`),
          price: row?.price,
        });
      }
    }
    const extras = sauceChargeDetails.map((row) => ({
      id: row.id,
      label: t(`sauce.${row.id}`),
      price: row.charge,
    }));
    const notesTrim = sellerNotes.trim();
    const requestedDrinkLabel = requestedDrinkId
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
      salads,
      toppings,
      extras,
      quantity,
      price: finalUnitPrice,
      mealFriesChoices,
      mealFriesChoiceId: mfIds[0] || "",
      mealFriesLabel,
      mealFriesPrice: mfPriceSum,
      ...(showBunSauceOnMeal ? { bunSauceOnBun } : {}),
      ...(isBeefBurgerMeal
        ? {
            burgerDoneness: {
              id: donenessId,
              label: t(`ui.doneness.${donenessId}`),
            },
          }
        : {}),
      ...(isKidsCrispyBurger ? { kidsBreadChoice } : {}),
      ...(isAdultCrispyBurger ? { adultCrispyBli } : {}),
      ...(requestedDrinkId
        ? { requestedDrinkId, requestedDrinkLabel, requestedDrinkPrice }
        : {}),
      ...(notesTrim ? { sellerNotes: notesTrim } : {}),
      ...(item.category === "specials" && !isSpecialCheeseBomb
        ? {
            specialPattyGrams: isSpecialLettuceBurger
              ? 160
              : Number(specialPattyGrams) === 220
                ? 220
                : 200,
          }
        : {}),
    };

    const baseCart = replaceLineId
      ? cartItems.filter((row) => row.id !== replaceLineId)
      : cartItems;
    const afterMerge = simulateCartAfterAdd(baseCart, linePayload);
    const pattyHint =
      item.category === "specials" && !isSpecialCheeseBomb
        ? isSpecialLettuceBurger
          ? 160
          : Number(specialPattyGrams) === 220
            ? 220
            : 200
        : undefined;
    const pattyCheck = await validatePattyStockForSimulatedCart(
      afterMerge,
      item.id,
      pattyHint
    );
    if (!pattyCheck.ok) {
      if (typeof window !== "undefined") {
        window.alert(pattyCartShortageMessage(t, pattyCheck));
      }
      return;
    }

    setIsAdding(true);
    if (replaceLineId) {
      replaceCartLine(replaceLineId, linePayload);
    } else {
      addItem(linePayload);
    }
    setTimeout(() => {
      setIsAdding(false);
      handleClose();
    }, 250);
  };

  const handleAdd = () => {
    if (!item || blocked) return;
    const missing = computeMissingMealSelections(
      selectedSalads,
      selectedSauces,
      mealFriesSelectedIds
    );
    if (missing.length > 0) {
      setMealValidateMissing(missing);
      setMealValidateOpen(true);
      return;
    }
    void performAddToCart();
  };

  const handleMealValidateAddAnyway = () => {
    setMealValidateOpen(false);
    setMealValidateMissing([]);
    void performAddToCart();
  };

  const handleMealValidateGoBack = () => {
    setMealValidateOpen(false);
    setMealValidateMissing([]);
  };

  if (!open || !item) return null;

  const name = menuItemName(item, t, locale);
  const mealValidateFriesOnlyMissing =
    mealValidateMissing.length === 1 &&
    mealValidateMissing[0] === "fries";

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-bh-overlay text-bh-text backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meal-wizard-title"
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-bh-border bg-bh-elevated/90 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2
            id="meal-wizard-title"
            className="truncate text-base font-bold text-primary"
          >
            {name}
          </h2>
          <p className="mt-1 text-[11px] leading-snug text-bh-faint">
            {isSpecialRestrictedWizard
              ? isSpecialCheeseBomb
                ? t("ui.wizardSpecialSaladsOnlyCheeseBomb")
                : t("ui.wizardSpecialSaladsOnly")
              : isSpecialMealCat
                ? t("ui.wizardSpecialFullCustomizeHint")
                : t("ui.wizardAllOnOneScreen")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="shrink-0 rounded-full border border-bh-border-strong px-3 py-1.5 text-xs text-bh-muted hover:border-slate-400"
        >
          {t("ui.wizardClose")}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isOutOfStock ? (
          <p className="mb-4 text-base font-extrabold text-red-500">
            {t("ui.outOfStock")}
          </p>
        ) : null}

        {isKidsCrispyBurger ? (
          <section className="mb-6 space-y-2 text-xs">
            <h3 className="text-[11px] font-semibold text-bh-muted">
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
                      : "border-bh-border-strong text-bh-muted"
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
            <h3 className="text-[11px] font-semibold text-bh-muted">
              {t("ui.wizardServingTitle")}
            </h3>
            <button
              type="button"
              disabled={blocked}
              onClick={() => setAdultCrispyBli((v) => !v)}
              className={`rounded-full border px-3 py-2 text-[11px] ${
                adultCrispyBli
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-bh-border-strong text-bh-muted"
              }`}
            >
              {t("ui.adultCrispyNoRound")}
            </button>
          </section>
        ) : null}

        {isSpecialMealCat && specialFixedMealToppingsText ? (
          <section className="mb-6 space-y-1.5 text-xs" aria-live="polite">
            <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
              <h3 className="text-[11px] font-semibold text-bh-muted">
                {t("ui.specialFixedToppingsTitle")}
              </h3>
              <span className="shrink-0 text-[10px] font-semibold text-amber-500/95">
                {t("ui.specialFixedToppingsHint")}
              </span>
            </div>
            <p className="rounded-lg border border-bh-border-strong bg-bh-card/55 px-3 py-2.5 text-[11px] leading-relaxed text-bh-muted">
              {specialFixedMealToppingsText}
            </p>
          </section>
        ) : null}

        {isSpecialMealCat && !isSpecialCheeseBomb && !isSpecialLettuceBurger ? (
          <section className="mb-6 space-y-2 text-xs">
            <h3 className="text-[11px] font-semibold text-bh-muted">
              {t("ui.specialPattyTitle")}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={blocked || !specialCanPatty200}
                onClick={() => setSpecialPattyGrams(200)}
                className={`rounded-full border px-2.5 py-2 text-[11px] ${
                  !specialCanPatty200
                    ? "cursor-not-allowed border-bh-border-strong bg-bh-card text-bh-faint"
                    : Number(specialPattyGrams) !== 220
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-bh-border-strong text-bh-muted"
                }`}
              >
                {specialCanPatty200
                  ? t("ui.specialPatty200")
                  : t("ui.specialPatty200Depleted")}
              </button>
              <button
                type="button"
                disabled={blocked || !specialCanPatty220}
                onClick={() => setSpecialPattyGrams(220)}
                className={`rounded-full border px-2.5 py-2 text-[11px] ${
                  !specialCanPatty220
                    ? "cursor-not-allowed border-bh-border-strong bg-bh-card text-bh-faint"
                    : Number(specialPattyGrams) === 220
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-bh-border-strong text-bh-muted"
                }`}
              >
                {specialCanPatty220
                  ? t("ui.specialPatty220")
                  : t("ui.specialPatty220Depleted")}
              </button>
            </div>
          </section>
        ) : null}

        <section className="mb-6 space-y-2 text-xs">
          <h3 className="text-[11px] font-semibold text-bh-muted">
            {t("ui.freeSalads")}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {saladChoicesList.map((x) => {
              const extra = Number(x.price) || 0;
              const saladOos =
                INVENTORY_MANAGED_SALAD_IDS.has(x.id) && isUnavailable(x.id);
              return (
                <label
                  key={x.id}
                  className={`flex items-center gap-1.5 rounded-full border px-2 py-1.5 text-[11px] ${
                    saladOos
                      ? "cursor-not-allowed border-bh-border bg-bh-card text-bh-faint opacity-75"
                      : "cursor-pointer"
                  } ${
                    !saladOos && selectedSalads.includes(x.id)
                      ? "border-primary bg-primary/10 text-primary"
                      : !saladOos
                        ? "border-bh-border-strong text-bh-muted"
                        : ""
                  }`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    {x.image ? (
                      <img
                        src={x.image}
                        alt={t(`salad.${x.id}`)}
                        className="h-8 w-8 shrink-0 rounded-md border border-bh-border-strong object-cover"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 leading-snug">
                      {t(`salad.${x.id}`)}
                      {saladOos ? (
                        <span className="mr-1 block text-[10px] text-amber-600">
                          {t("ui.saladOutOfStock")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {extra > 0 ? (
                    <span className="shrink-0 text-[10px] text-bh-faint tabular-nums">
                      {t("ui.saucePlus")}
                      {formatIls(extra)}
                    </span>
                  ) : null}
                  <input
                    type="checkbox"
                    className="hidden"
                    disabled={blocked || saladOos}
                    checked={selectedSalads.includes(x.id)}
                    onChange={() => {
                      if (saladOos) return;
                      toggleSaladChoice(x.id);
                    }}
                  />
                </label>
              );
            })}
            <label
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1.5 text-[11px] ${
                noSaladsSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-bh-border-strong text-bh-muted"
              }`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <img
                  src={NO_SALADS_CHOICE.image}
                  alt={t("salad.salad_none")}
                  className="h-8 w-8 shrink-0 rounded-md border border-bh-border-strong bg-white object-cover"
                />
                <span className="min-w-0 flex-1 leading-snug">
                  {t("salad.salad_none")}
                </span>
              </span>
              <input
                type="checkbox"
                className="hidden"
                disabled={blocked}
                checked={noSaladsSelected}
                onChange={() => toggleSaladChoice(NO_SALADS_CHOICE_ID)}
              />
            </label>
          </div>
        </section>

        {showBunSauceOnMeal ? (
          <section className="mb-6 space-y-2 text-xs">
            <h3 className="text-[11px] font-semibold text-bh-muted">
              {t("ui.bunSauceOnBunTitle")}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={blocked}
                onClick={() => setBunSauceOnBun(true)}
                className={`rounded-full border px-2.5 py-2 text-[11px] ${
                  bunSauceOnBun
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-bh-border-strong text-bh-muted"
                }`}
              >
                {t("ui.bunSauceYes")}
              </button>
              <button
                type="button"
                disabled={blocked}
                onClick={() => setBunSauceOnBun(false)}
                className={`rounded-full border px-2.5 py-2 text-[11px] ${
                  !bunSauceOnBun
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-bh-border-strong text-bh-muted"
                }`}
              >
                {t("ui.bunSauceNo")}
              </button>
            </div>
          </section>
        ) : null}

        {isBeefBurgerMeal ? (
          <section className="mb-6 space-y-2 text-xs">
            <h3 className="text-[11px] font-semibold text-bh-muted">
              {t("ui.donenessTitle")}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {BURGER_DONENESS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => setDonenessId(opt.id)}
                  className={`rounded-full border px-2.5 py-2 text-[11px] ${
                    donenessId === opt.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-bh-border-strong text-bh-muted"
                  }`}
                >
                  {t(`ui.doneness.${opt.id}`)}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {!isSpecialRestrictedWizard ? (
        <section className="mb-6 space-y-2 text-xs">
          <h3 className="text-[11px] font-semibold text-bh-muted">
            {item?.category === "crispy"
              ? t("ui.crispyToppings")
              : t("ui.burgerToppings")}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {toppingChoices.map((x) => {
              const topUnavail = isUnavailable(x.id);
              const dbl = DOUBLE_CHEESE_TOPPING_IDS.has(x.id);
              const cheeseLayers = cheeseMode[x.id] || 0;
              const selected = dbl ? cheeseLayers > 0 : selectedToppings.includes(x.id);
              const rowBlocked = topUnavail && !selected;

              if (dbl) {
                return (
                  <div
                    key={x.id}
                    className={`flex w-full min-w-0 items-center gap-1 rounded-full border px-1.5 py-1.5 text-[11px] ${
                      cheeseLayers > 0
                        ? "border-primary bg-primary/10 text-primary"
                        : rowBlocked
                          ? "border-bh-border text-bh-faint opacity-60"
                          : "border-bh-border-strong text-bh-muted"
                    }`}
                  >
                    <button
                      type="button"
                      disabled={blocked || rowBlocked}
                      onClick={() => toggleCheeseRow(x.id)}
                      className="flex min-w-0 flex-1 items-center gap-1 rounded-md text-start disabled:cursor-not-allowed"
                    >
                      {x.image ? (
                        <img
                          src={x.image}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-md border border-bh-border-strong object-cover"
                        />
                      ) : null}
                      <span className="min-w-0 truncate leading-snug">
                        {toppingDisplayName(x, t, locale)}
                        {topUnavail ? (
                          <span className="mr-1 text-[10px] text-amber-600/90">
                            ({t("ui.soldOutShort")})
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {cheeseLayers > 0 ? (
                      <button
                        type="button"
                        disabled={blocked}
                        onClick={(e) => toggleCheeseDouble(x.id, e)}
                        className={`shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold leading-none transition-colors ${
                          cheeseLayers === 2
                            ? "border-primary bg-primary/20 text-primary"
                            : "border-bh-border-strong text-bh-faint hover:border-bh-border-strong hover:text-bh-text"
                        } disabled:opacity-50`}
                      >
                        {t("ui.doubleWord")}
                      </button>
                    ) : null}
                    <span className="shrink-0 text-[10px] text-bh-faint tabular-nums">
                      {cheeseLayers > 0
                        ? `+₪${formatIls(x.price * cheeseLayers)}`
                        : `+₪${formatIls(x.price)}`}
                    </span>
                  </div>
                );
              }

              return (
                <label
                  key={x.id}
                  className={`flex items-center justify-between gap-1.5 rounded-full border px-2 py-1.5 text-[11px] ${
                    rowBlocked
                      ? "cursor-not-allowed border-bh-border text-bh-faint opacity-60"
                      : "cursor-pointer"
                  } ${
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : rowBlocked
                        ? ""
                        : "border-bh-border-strong text-bh-muted"
                  }`}
                >
                  {x.image ? (
                    <img
                      src={x.image}
                      alt={toppingDisplayName(x, t, locale)}
                      className="h-8 w-8 shrink-0 rounded-md border border-bh-border-strong object-cover"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 pr-1 leading-snug">
                    {toppingDisplayName(x, t, locale)}
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
                  <span className="shrink-0 text-[10px] text-bh-faint">
                    +₪{x.price}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
        ) : null}

        <section className="mb-4 space-y-2 text-xs">
          <h3 className="text-[11px] font-semibold text-bh-muted">
            {t("ui.extraSauces")}
          </h3>
          <p className="text-[10px] leading-snug text-bh-faint">
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
                      : "border-bh-border-strong text-bh-muted"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-1.5 justify-self-start">
                    {x.image ? (
                      <img
                        src={x.image}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-md border border-bh-border-strong object-cover"
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
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-bh-border-strong text-sm leading-none text-bh-text hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
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
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-bh-border-strong text-sm leading-none text-bh-text hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={t("ui.sauceRemoveOne")}
                    >
                      −
                    </button>
                  </div>
                  <div className="flex min-h-[1.25rem] min-w-0 items-center justify-self-end">
                    <span className="w-full min-w-[2.25rem] text-end text-[10px] leading-tight text-bh-faint">
                      {sauceNextUnitSuffix(x.id)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="mb-4 space-y-1.5">
          <section className="mb-4 space-y-2" aria-labelledby="meal-fries-heading">
            <div id="meal-fries-heading">
              <h3 className="text-[11px] font-semibold text-bh-muted">
                {t("ui.mealFriesForMealLabel")}
              </h3>
              <p className="mt-0.5 text-[10px] text-bh-faint">
                {t("ui.mealFriesMultiHint")}
              </p>
            </div>
            <div
              id="meal-fries-choice"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {mealFriesRows.map((opt) => {
                const selected = sortMealFriesIds(mealFriesSelectedIds).includes(
                  opt.id
                );
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={blocked}
                    onClick={() =>
                      setMealFriesSelectedIds((prev) =>
                        toggleMealFriesIdInSelection(prev, opt.id)
                      )
                    }
                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-start text-[11px] ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-bh-border-strong text-bh-muted"
                    } ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    {opt.image ? (
                      <img
                        src={opt.image}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-md border border-bh-border-strong object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="h-8 w-8 shrink-0 rounded-md border border-bh-border-strong bg-bh-elevated"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1 leading-snug">
                      {opt.label}
                    </span>
                    <span className="shrink-0 text-[10px] text-bh-faint tabular-nums">
                      +₪
                      {formatIls(
                        mealFriesEffectiveExtraPrice(opt.id, mealFriesSelectedIds)
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          <label
            htmlFor="meal-requested-drink"
            className="block text-[11px] font-semibold text-bh-muted"
          >
            {t("ui.addDrinkQuestion")}
          </label>
          <div id="meal-requested-drink" className="relative">
            <button
              type="button"
              disabled={blocked}
              onClick={() => {
                setDrinkMenuOpen((v) => !v);
              }}
              className="flex w-full items-center justify-between rounded-lg border border-bh-border-strong bg-bh-card px-3 py-2 text-xs text-bh-text outline-none transition-colors hover:border-primary disabled:opacity-50"
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
                  className="flex w-full items-center justify-between border-b border-bh-border px-3 py-2 text-xs text-bh-muted hover:bg-bh-card"
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
                    className={`flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-bh-card ${
                      requestedDrinkId === opt.id
                        ? "bg-primary/10 text-primary"
                        : "text-bh-text"
                    }`}
                  >
                    <span className="text-[11px] text-bh-muted">
                      +₪{formatIls(opt.price)}
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{opt.label}</span>
                      <img
                        src={opt.image}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-md border border-bh-border-strong object-cover"
                        loading="lazy"
                      />
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-4 space-y-1.5">
          <label
            htmlFor="meal-seller-notes"
            className="block text-[11px] font-semibold text-bh-muted"
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
            className="w-full resize-y rounded-lg border border-bh-border-strong bg-bh-card px-3 py-2 text-xs text-bh-text outline-none placeholder:text-bh-faint focus:border-primary disabled:opacity-50"
          />
        </div>
      </div>

      <div
        className="shrink-0 border-t border-bh-border/90 bg-bh-elevated/98 px-4 py-2.5 shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.45)] backdrop-blur-sm supports-[backdrop-filter]:bg-bh-elevated/90"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="text-center text-sm text-bh-faint">
          {t("ui.wizardPriceLine")}{" "}
          <span className="font-bold text-primary tabular-nums">
            ₪{formatIls(finalUnitPrice)}
          </span>
          {quantity > 1 ? (
            <span className="mr-1 text-bh-faint">
              {" "}
              × {quantity} = ₪{formatIls(finalUnitPrice * quantity)}
            </span>
          ) : null}
        </p>
      </div>
      </div>

      <footer className="shrink-0 border-t border-bh-border bg-bh-elevated/95 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center justify-center gap-3 sm:justify-start">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={blocked}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-bh-border-strong text-lg leading-none disabled:opacity-50"
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
              className="flex h-9 w-9 items-center justify-center rounded-full border border-bh-border-strong text-lg leading-none disabled:opacity-50"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={isAdding || blocked || mealValidateOpen}
            className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50"
          >
            {isAdding
              ? t("ui.added")
              : replaceLineId
                ? t("ui.updateMealInCart")
                : t("ui.addToCart")}
          </button>
        </div>
      </footer>

      {mealValidateOpen ? (
        <div
          className="absolute inset-0 z-[210] flex items-center justify-center bg-bh-overlay p-4 backdrop-blur-sm"
          role="presentation"
          onClick={handleMealValidateGoBack}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-amber-500/45 bg-bh-elevated p-4 shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="meal-validate-title"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="meal-validate-title"
              className="mb-3 text-center text-base font-bold text-amber-200"
            >
              {t("ui.mealValidateTitle")}
            </h3>
            <ul className="mb-4 list-disc space-y-1.5 pr-5 text-sm leading-relaxed text-bh-text">
              {mealValidateMissing.map((key) => (
                <li key={key}>{t(MEAL_VALIDATE_I18N[key])}</li>
              ))}
            </ul>
            <div className="flex flex-col gap-2">
              {!mealValidateFriesOnlyMissing ? (
                <button
                  type="button"
                  onClick={handleMealValidateAddAnyway}
                  className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-black transition-opacity hover:opacity-90"
                >
                  {t("ui.mealValidateAddAnyway")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleMealValidateGoBack}
                className="w-full rounded-xl border border-bh-border-strong py-3 text-sm font-semibold text-bh-text transition-colors hover:bg-bh-card"
              >
                {t("ui.mealValidateGoBack")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
