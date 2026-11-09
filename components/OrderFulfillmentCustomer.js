import { useCallback, useEffect, useState } from "react";
import {
  clearActiveOrderResume,
  isOpenFulfillmentStatus,
} from "@/utils/activeOrderResume";
import {
  formatCountdown,
  fulfillmentStatusLabelKey,
  fulfillmentStatusToneClass,
  prepRemainingMs,
  resolveFulfillment,
} from "@/utils/orderFulfillment";

/**
 * @param {{
 *   orderNumber: string | number,
 *   t: (k: string) => string,
 *   className?: string,
 *   onStatus?: (status: string) => void,
 * }} props
 */
export default function OrderFulfillmentCustomer({
  orderNumber,
  t,
  className = "",
  onStatus,
}) {
  const [fulfillment, setFulfillment] = useState(null);
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState("");

  const on = String(orderNumber ?? "").trim();

  const load = useCallback(async () => {
    if (!on || !/^\d{3,8}$/.test(on)) return;
    try {
      const r = await fetch(
        `/api/orders/status?on=${encodeURIComponent(on)}&_=${Date.now()}`,
        { cache: "no-store" }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(t("orderStatus.errLoad"));
        return;
      }
      setErr("");
      const f = d.fulfillment || null;
      setFulfillment(f);
      const st = String(f?.status || "");
      if (st && !isOpenFulfillmentStatus(st)) {
        clearActiveOrderResume();
      }
      if (st && typeof onStatus === "function") onStatus(st);
    } catch {
      setErr(t("orderStatus.errLoad"));
    }
  }, [on, t, onStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(id);
  }, [on, load]);

  useEffect(() => {
    if (!fulfillment || fulfillment.status !== "preparing") return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [fulfillment?.status, fulfillment?.prepEndsAt]);

  if (!on) return null;

  void tick;
  const now = Date.now();
  const resolved = fulfillment
    ? resolveFulfillment({ fulfillment }, now)
    : null;
  const remaining = resolved ? prepRemainingMs(resolved, now) : null;

  return (
    <div
      className={`w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900/70 p-3 text-center ${className}`}
      dir="rtl"
    >
      <p className="text-[11px] font-semibold text-gray-400">
        {t("orderStatus.customerTitle")}
      </p>
      {err ? (
        <p className="mt-1 text-xs text-amber-200">{err}</p>
      ) : resolved ? (
        <>
          <div
            className={`mt-2 inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-extrabold ${fulfillmentStatusToneClass(
              resolved.status
            )}`}
          >
            {t(fulfillmentStatusLabelKey(resolved.status))}
          </div>
          {resolved.status === "preparing" ? (
            <p className="mt-2 text-2xl font-black tabular-nums text-amber-200">
              {formatCountdown(remaining)}
            </p>
          ) : null}
          {resolved.status === "preparing" && resolved.prepMinutes != null ? (
            <p className="mt-1 text-[11px] text-gray-400">
              {t("orderStatus.prepMinutesHint").replace(
                "{n}",
                String(resolved.prepMinutes)
              )}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-gray-500">{t("orderStatus.loading")}</p>
      )}
    </div>
  );
}
