import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getJerusalemWeekday,
  isOrderingAllowedAt,
  isRestaurantOpenAt,
} from "@/utils/orderingHours";

const OrderingHoursContext = createContext(null);

/** לפי לוח הניהול: היום הנוכחי מסומן כפתוח (V) */
function isTodayEnabledInSchedule(days) {
  if (!Array.isArray(days)) return true;
  const wd = getJerusalemWeekday(new Date());
  const row = days.find((d) => d.weekday === wd);
  if (!row) return true;
  return Boolean(row.enabled);
}

export function OrderingHoursProvider({ children }) {
  const [orderingAllowed, setOrderingAllowed] = useState(true);
  const [restaurantOpen, setRestaurantOpen] = useState(false);
  const [todayScheduledOpen, setTodayScheduledOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/business-hours");
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.days)) {
          setTodayScheduledOpen(isTodayEnabledInSchedule(data.days));
          const now = new Date();
          setOrderingAllowed(isOrderingAllowedAt(now, data.days));
          setRestaurantOpen(isRestaurantOpenAt(now, data.days));
        } else {
          setTodayScheduledOpen(true);
          const now = new Date();
          setOrderingAllowed(isOrderingAllowedAt(now, null));
          setRestaurantOpen(isRestaurantOpenAt(now, null));
        }
      } catch {
        if (!cancelled) {
          setTodayScheduledOpen(true);
          const now = new Date();
          setOrderingAllowed(isOrderingAllowedAt(now, null));
          setRestaurantOpen(isRestaurantOpenAt(now, null));
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

  const value = useMemo(
    () => ({ orderingAllowed, restaurantOpen, todayScheduledOpen }),
    [orderingAllowed, restaurantOpen, todayScheduledOpen]
  );

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
