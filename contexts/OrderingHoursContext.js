import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getJerusalemWeekday,
  getTodayOpenTimeDisplay,
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
  const [todayOpenTimeDisplay, setTodayOpenTimeDisplay] =
    useState("16:00");

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
          setTodayOpenTimeDisplay(getTodayOpenTimeDisplay(data.days, now));
        } else {
          setTodayScheduledOpen(true);
          const now = new Date();
          setOrderingAllowed(isOrderingAllowedAt(now, null));
          setRestaurantOpen(isRestaurantOpenAt(now, null));
          setTodayOpenTimeDisplay(getTodayOpenTimeDisplay(null, now));
        }
      } catch {
        if (!cancelled) {
          setTodayScheduledOpen(true);
          const now = new Date();
          setOrderingAllowed(isOrderingAllowedAt(now, null));
          setRestaurantOpen(isRestaurantOpenAt(now, null));
          setTodayOpenTimeDisplay(getTodayOpenTimeDisplay(null, now));
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
    () => ({
      orderingAllowed,
      restaurantOpen,
      todayScheduledOpen,
      todayOpenTimeDisplay,
    }),
    [orderingAllowed, restaurantOpen, todayScheduledOpen, todayOpenTimeDisplay]
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
