import { createContext, useContext, useMemo, useState } from "react";
import { sumCartLines } from "@/utils/cartMoney";

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
  if (!Array.isArray(tops)) return false;
  return tops.some(
    (top) => typeof top?.id === "string" && isUnavailable(top.id)
  );
}

/** Same dish + same meal options → one cart row (quantity). Any difference → new row. */
export function customizationKey(item) {
  const pid = cartLineProductId(item);
  const salads = [...(item.salads?.map((s) => s.id) || [])].sort().join(",");
  const tops = [...(item.toppings?.map((s) => s.id) || [])].sort().join(",");
  const extras = [...(item.extras?.map((s) => `${s.id}:${s.price}`) || [])]
    .sort()
    .join(",");
  const variant = item.variantLabel ?? "";
  const size = item.sizeLabel ?? "";
  const notes = String(item.sellerNotes ?? "").trim();
  const requestedDrink = String(item.requestedDrinkId ?? "").trim();
  return `${pid}|${size}|${variant}|${salads}|${tops}|${extras}|${requestedDrink}|${notes}`;
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

