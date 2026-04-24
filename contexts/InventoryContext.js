import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const [unavailableIds, setUnavailableIds] = useState([]);
  const [pattyStock, setPattyStock] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/inventory");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return;
      const ids = d.unavailableIds;
      setUnavailableIds(Array.isArray(ids) ? ids : []);
      if (d.pattyStock != null && typeof d.pattyStock === "object") {
        setPattyStock(d.pattyStock);
      } else {
        setPattyStock(null);
      }
    } catch {
      /* keep previous */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refresh();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    }
  }, [refresh]);

  const unavailableSet = useMemo(() => new Set(unavailableIds), [unavailableIds]);

  const isUnavailable = useCallback(
    (productId) => {
      if (!productId || typeof productId !== "string") return false;
      return unavailableSet.has(productId);
    },
    [unavailableSet]
  );

  const value = useMemo(
    () => ({
      unavailableIds,
      unavailableSet,
      isUnavailable,
      pattyStock,
      refresh,
    }),
    [unavailableIds, unavailableSet, isUnavailable, pattyStock, refresh]
  );

  return (
    <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error("useInventory must be used within InventoryProvider");
  }
  return ctx;
}
