import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { coerceDayEnabled } from "@/utils/coerceDayEnabled";
import {
  getJerusalemWeekday,
  getTodayClosedReason,
  getTodayOpenTimeDisplay,
  isInPreOpeningDialogWindow,
  isOrderingAllowedAt,
  isRestaurantOpenAt,
} from "@/utils/orderingHours";

const OrderingHoursContext = createContext(null);

/** לפי לוח הניהול: היום הנוכחי מסומן כפתוח (V) */
function isTodayEnabledInSchedule(days) {
  if (!Array.isArray(days)) return true;
  const wd = getJerusalemWeekday(new Date());
  const row =
    days.find((d) => Number(d?.weekday) === wd) ?? days[wd] ?? null;
  if (!row) return true;
  return coerceDayEnabled(row.enabled);
}

export function OrderingHoursProvider({ children }) {
  const [hoursLoaded, setHoursLoaded] = useState(false);
  const [orderingAllowed, setOrderingAllowed] = useState(true);
  const [restaurantOpen, setRestaurantOpen] = useState(false);
  const [todayScheduledOpen, setTodayScheduledOpen] = useState(true);
  const [todayOpenTimeDisplay, setTodayOpenTimeDisplay] =
    useState("16:00");
  const [todayClosedReason, setTodayClosedReason] = useState("");
  const [preOpeningWindow, setPreOpeningWindow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/business-hours");
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        const now = new Date();
        if (data?.ok && Array.isArray(data.days)) {
          setTodayScheduledOpen(isTodayEnabledInSchedule(data.days));
          setOrderingAllowed(isOrderingAllowedAt(now, data.days));
          setRestaurantOpen(isRestaurantOpenAt(now, data.days));
          setTodayOpenTimeDisplay(getTodayOpenTimeDisplay(data.days, now));
          setTodayClosedReason(getTodayClosedReason(data.days, now));
          setPreOpeningWindow(isInPreOpeningDialogWindow(now, data.days));
        } else {
          setTodayScheduledOpen(true);
          setOrderingAllowed(isOrderingAllowedAt(now, null));
          setRestaurantOpen(isRestaurantOpenAt(now, null));
          setTodayOpenTimeDisplay(getTodayOpenTimeDisplay(null, now));
          setTodayClosedReason("");
          setPreOpeningWindow(isInPreOpeningDialogWindow(now, null));
        }
      } catch {
        if (!cancelled) {
          const now = new Date();
          setTodayScheduledOpen(true);
          setOrderingAllowed(isOrderingAllowedAt(now, null));
          setRestaurantOpen(isRestaurantOpenAt(now, null));
          setTodayOpenTimeDisplay(getTodayOpenTimeDisplay(null, now));
          setTodayClosedReason("");
          setPreOpeningWindow(isInPreOpeningDialogWindow(now, null));
        }
      } finally {
        if (!cancelled) setHoursLoaded(true);
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
      hoursLoaded,
      orderingAllowed,
      restaurantOpen,
      todayScheduledOpen,
      todayOpenTimeDisplay,
      todayClosedReason,
      preOpeningWindow,
    }),
    [
      hoursLoaded,
      orderingAllowed,
      restaurantOpen,
      todayScheduledOpen,
      todayOpenTimeDisplay,
      todayClosedReason,
      preOpeningWindow,
    ]
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
