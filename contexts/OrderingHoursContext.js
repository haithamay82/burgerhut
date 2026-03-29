import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { isOrderingAllowedAt } from "@/utils/orderingHours";

const OrderingHoursContext = createContext(null);

export function OrderingHoursProvider({ children }) {
  const [orderingAllowed, setOrderingAllowed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/business-hours");
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.days)) {
          setOrderingAllowed(isOrderingAllowedAt(new Date(), data.days));
        } else {
          setOrderingAllowed(isOrderingAllowedAt(new Date(), null));
        }
      } catch {
        if (!cancelled) {
          setOrderingAllowed(isOrderingAllowedAt(new Date(), null));
        }
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const value = useMemo(() => ({ orderingAllowed }), [orderingAllowed]);

  return (
    <OrderingHoursContext.Provider value={value}>
      {children}
    </OrderingHoursContext.Provider>
  );
}

export function useOrderingHours() {
  const ctx = useContext(OrderingHoursContext);
  if (!ctx) {
    throw new Error("useOrderingHours must be used within OrderingHoursProvider");
  }
  return ctx;
}
