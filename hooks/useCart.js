import { createContext, useContext, useMemo, useState } from "react";
import { sumCartLines } from "@/utils/cartMoney";
import { INVENTORY_MANAGED_SALAD_IDS } from "@/utils/menuData";
import { mealFriesCustomizationKeyFromLine } from "@/utils/mealFriesChoices";

const CartContext = createContext(null);

/** מזהה מוצר בשורת עגלה (לפני או אחרי הוספת productId). */
export function cartLineProductId(item) {
  return (
    item.productId ||
    (typeof item.id === "string" && item.id.includes(":")
      ? item.id.split(":")[0]
      : item.id) ||
    ""
  );
}

/** מנה עיקרית או תוספת בורגר שסומנה כלא זמינה במלאי */
export function lineHasUnavailableInventory(line, isUnavailable) {
  const pid = cartLineProductId(line);
  if (pid && isUnavailable(pid)) return true;
  const tops = line.toppings;
  if (Array.isArray(tops)) {
    const badTop = tops.some(
      (top) => typeof top?.id === "string" && isUnavailable(top.id)
    );
    if (badTop) return true;
  }
  const sals = line.salads;
  if (Array.isArray(sals)) {
    return sals.some(
      (sal) =>
        typeof sal?.id === "string" &&
        INVENTORY_MANAGED_SALAD_IDS.has(sal.id) &&
        isUnavailable(sal.id)
    );
  }
  return false;
}

/** Same dish + same meal options → one cart row (quantity). Any difference → new row. */
export function customizationKey(item) {
  const pid = cartLineProductId(item);
  const salads = [...(item.salads?.map((s) => s.id) || [])].sort().join(",");
  const tops = [
    ...(item.toppings?.map((s) =>
      s?.layers === 2 ? `${s.id}:2` : s?.id
    ) || []),
  ]
    .filter(Boolean)
    .sort()
    .join(",");
  const extras = [...(item.extras?.map((s) => `${s.id}:${s.price}`) || [])]
    .sort()
    .join(",");
  const variant = item.variantLabel ?? "";
  const kidsBread = String(item.kidsBreadChoice ?? "").trim();
  const size = item.sizeLabel ?? "";
  const doneness = String(item.burgerDoneness?.id ?? "").trim();
  const notes = String(item.sellerNotes ?? "").trim();
  const requestedDrink = String(item.requestedDrinkId ?? "").trim();
  const mealFries = mealFriesCustomizationKeyFromLine(item);
  const bun =
    item.bunSauceOnBun === false
      ? "0"
      : item.bunSauceOnBun === true
        ? "1"
        : "";
  const specialPatty =
    String(pid).startsWith("special-") && pid !== "special-cheese-bomb"
      ? Number(item.specialPattyGrams) === 220
        ? "220"
        : "200"
      : "";
  const base = `${pid}|${size}|${variant}|${kidsBread}|${doneness}|${salads}|${tops}|${extras}|${mealFries}|${requestedDrink}|${bun}|${notes}`;
  return specialPatty ? `${base}|${specialPatty}` : base;
}

function newCartLineId(productId) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${productId}:${crypto.randomUUID()}`;
  }
  return `${productId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  const addItem = (item) => {
    setItems((prev) => {
      const inc = Math.max(1, Number(item.quantity) || 1);
      const pid = cartLineProductId(item) || "item";
      const keyed = { ...item, productId: pid };
      const key = customizationKey(keyed);
      const idx = prev.findIndex((row) => customizationKey(row) === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: next[idx].quantity + inc,
        };
        return next;
      }
      return [
        ...prev,
        { ...item, productId: pid, id: newCartLineId(pid), quantity: inc },
      ];
    });
  };

  const updateQuantity = (id, quantity) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item
      )
    );
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  /** עדכון שורת בורגר/קריספי קיימת (אותו id) — בלי מחיקה ומיזוג לשורה אחרת */
  const replaceCartLine = (lineId, nextPayload) => {
    const lid = String(lineId || "").trim();
    if (!lid) return;
    setItems((prev) =>
      prev.map((row) => {
        if (row.id !== lid) return row;
        const pid =
          cartLineProductId(nextPayload) || cartLineProductId(row) || "item";
        const qty = Math.max(
          1,
          Number(
            nextPayload.quantity !== undefined && nextPayload.quantity !== null
              ? nextPayload.quantity
              : row.quantity
          ) || 1
        );
        return {
          ...nextPayload,
          id: lid,
          productId: pid,
          quantity: qty,
        };
      })
    );
  };

  const clearCart = () => setItems([]);

  /** שחזור עגלה (למשל אחרי «חזרה» ממסך ביט/אשראי) */
  const replaceCart = (snapshot) => {
    if (!Array.isArray(snapshot) || snapshot.length === 0) return;
    setItems(
      snapshot.map((item) => {
        const pid = cartLineProductId(item) || "item";
        return {
          ...item,
          productId: pid,
          id:
            typeof item.id === "string" && item.id
              ? item.id
              : newCartLineId(pid),
          quantity: Math.max(1, Number(item.quantity) || 1),
        };
      })
    );
  };

  const total = useMemo(() => sumCartLines(items), [items]);

  const value = {
    items,
    addItem,
    updateQuantity,
    removeItem,
    replaceCartLine,
    clearCart,
    replaceCart,
    total
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}

