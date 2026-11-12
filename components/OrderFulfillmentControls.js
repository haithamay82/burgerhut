import { useEffect, useMemo, useState } from "react";
import {
  ORDER_PREP_MINUTE_PRESETS,
  ORDER_PREP_MINUTES_MAX,
  ORDER_PREP_MINUTES_MIN,
  formatCountdown,
  fulfillmentStatusLabelKey,
  fulfillmentStatusToneClass,
  normalizePrepMinutes,
  parseScheduledReadyAtMs,
  prepMinutesFromScheduledReadyAt,
  prepRemainingMs,
  resolveFulfillment,
} from "@/utils/orderFulfillment";

/**
 * @param {{
 *   order: object,
 *   secret: string,
 *   t: (k: string) => string,
 *   busyId: string,
 *   onBusy: (id: string) => void,
 *   onIdle: () => void,
 *   onUpdated: (order: object) => void,
 *   onError: (msg: string) => void,
 *   locale?: string,
 * }} props
 */
export default function OrderFulfillmentControls({
  order,
  secret,
  t,
  busyId,
  onBusy,
  onIdle,
  onUpdated,
  onError,
  locale = "he",
}) {
  const [tick, setTick] = useState(0);
  /** @type {"accept" | "extend" | null} */
  const [pickingMode, setPickingMode] = useState(null);
  const [customMins, setCustomMins] = useState("");

  const fulfillment = useMemo(
    () => resolveFulfillment(order, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick forces refresh
    [order, tick]
  );

  const scheduledReadyAt = order?.scheduledReadyAt || null;
  const scheduledMs = parseScheduledReadyAtMs(scheduledReadyAt);
  const suggestedPrepMins = useMemo(
    () => prepMinutesFromScheduledReadyAt(scheduledReadyAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick refreshes suggestion
    [scheduledReadyAt, tick, fulfillment.status]
  );

  const scheduledReadyLabel = useMemo(() => {
    if (scheduledMs == null) return "";
    try {
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "he-IL", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(scheduledMs));
    } catch {
      return new Date(scheduledMs).toLocaleString();
    }
  }, [scheduledMs, locale]);

  useEffect(() => {
    if (fulfillment.status !== "preparing" || !fulfillment.prepEndsAt) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [fulfillment.status, fulfillment.prepEndsAt]);

  // ביטול לקוח / דחייה / שינוי סטטוס — סוגרים בחירת דקות כדי שלא יישארו קבל/דחה
  useEffect(() => {
    if (pickingMode === "accept" && fulfillment.status !== "pending") {
      setPickingMode(null);
      setCustomMins("");
    } else if (
      pickingMode === "extend" &&
      fulfillment.status !== "preparing"
    ) {
      setPickingMode(null);
      setCustomMins("");
    }
  }, [fulfillment.status, pickingMode]);

  const remaining = prepRemainingMs(fulfillment, Date.now());
  const busy = busyId === order.id;
  const showAcceptPicker =
    pickingMode === "accept" && fulfillment.status === "pending";
  const showExtendPicker =
    pickingMode === "extend" && fulfillment.status === "preparing";
  const showMinutesPicker = showAcceptPicker || showExtendPicker;
  const isDeferredPending =
    fulfillment.status === "pending" && suggestedPrepMins != null;

  const openAcceptPicker = () => {
    if (suggestedPrepMins != null) {
      setCustomMins(String(suggestedPrepMins));
    } else {
      setCustomMins("");
    }
    setPickingMode("accept");
  };

  const patch = async (body) => {
    const s = String(secret || "").trim();
    if (!s || !order?.id) return;
    onBusy(order.id);
    onError("");
    try {
      const r = await fetch(`/api/orders?id=${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": s,
        },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const map = {
          invalid_state: "orderStatus.errState",
          invalid_prep_minutes: "orderStatus.errPrepMinutes",
          not_found: "admin.doneErr",
        };
        onError(t(map[d.error] || "admin.doneErr"));
        return;
      }
      if (d?.order && typeof d.order === "object") {
        onUpdated(d.order);
      }
      setPickingMode(null);
      setCustomMins("");
    } catch {
      onError(t("admin.errNet"));
    } finally {
      onIdle();
    }
  };

  const submitMinutes = (mins) => {
    const n = normalizePrepMinutes(mins);
    if (n == null) {
      onError(t("orderStatus.errPrepMinutes"));
      return;
    }
    if (pickingMode === "extend") {
      void patch({ action: "extend", prepMinutes: n });
      return;
    }
    void patch({ action: "accept", prepMinutes: n });
  };

  return (
    <div className="mt-2 space-y-3">
      <div
        className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-bold ${fulfillmentStatusToneClass(
          fulfillment.status
        )}`}
      >
        {t(fulfillmentStatusLabelKey(fulfillment.status))}
      </div>

      {isDeferredPending ? (
        <div className="space-y-1 rounded-lg border border-violet-700/50 bg-violet-950/30 px-2.5 py-2 text-[11px] text-violet-100">
          <p className="font-extrabold">{t("orderStatus.deferredBadge")}</p>
          {scheduledReadyLabel ? (
            <p>
              {t("orderStatus.deferredReadyAt").replace(
                "{time}",
                scheduledReadyLabel
              )}
            </p>
          ) : null}
          <p>
            {t("orderStatus.deferredSuggestedMins").replace(
              "{n}",
              String(suggestedPrepMins)
            )}
          </p>
        </div>
      ) : null}

      {fulfillment.status === "preparing" ? (
        <p className="text-sm font-extrabold tabular-nums text-amber-200">
          {t("orderStatus.countdownLabel")}: {formatCountdown(remaining)}
          {fulfillment.prepMinutes != null
            ? ` · ${fulfillment.prepMinutes} ${t("orderStatus.minutesUnit")}`
            : ""}
        </p>
      ) : null}

      {fulfillment.status === "pending" && !pickingMode ? (
        <div className="flex flex-wrap items-center gap-5">
          {isDeferredPending ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void patch({
                  action: "accept",
                  prepMinutes: suggestedPrepMins,
                })
              }
              className="rounded-lg border border-violet-600/60 bg-violet-900/40 px-3 py-2 text-[11px] font-semibold text-violet-100 hover:bg-violet-900/60 disabled:opacity-50"
            >
              {busy
                ? t("orderStatus.saving")
                : t("orderStatus.acceptAtCustomerTime").replace(
                    "{n}",
                    String(suggestedPrepMins)
                  )}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={openAcceptPicker}
            className="rounded-lg border border-emerald-700/60 bg-emerald-900/30 px-3 py-2 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
          >
            {busy ? t("orderStatus.saving") : t("orderStatus.accept")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void patch({ action: "reject" })}
            className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-[11px] font-semibold text-red-300 hover:bg-red-950/50 disabled:opacity-50"
          >
            {t("orderStatus.reject")}
          </button>
        </div>
      ) : null}

      {showMinutesPicker ? (
        <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/60 p-2">
          <p className="text-[11px] font-semibold text-gray-300">
            {showExtendPicker
              ? t("orderStatus.pickExtendMinutes")
              : t("orderStatus.pickPrepMinutes")}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {ORDER_PREP_MINUTE_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy}
                onClick={() => submitMinutes(m)}
                className="flex min-h-[3rem] items-center justify-center rounded-xl border border-amber-700/50 bg-amber-950/30 px-3 py-3 text-base font-extrabold tabular-nums text-amber-100 hover:bg-amber-950/50 disabled:opacity-50 sm:min-h-[3.25rem]"
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[6.5rem] flex-1">
              <label className="mb-0.5 block text-[10px] text-gray-400">
                {t("orderStatus.customMinutes")}
              </label>
              <input
                type="number"
                min={ORDER_PREP_MINUTES_MIN}
                max={ORDER_PREP_MINUTES_MAX}
                value={customMins}
                onChange={(e) => setCustomMins(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-primary"
                placeholder={`${ORDER_PREP_MINUTES_MIN}–${ORDER_PREP_MINUTES_MAX}`}
              />
            </div>
            <button
              type="button"
              disabled={busy || !customMins}
              onClick={() => submitMinutes(customMins)}
              className="rounded-lg border border-emerald-700/60 bg-emerald-900/30 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 disabled:opacity-50"
            >
              {showExtendPicker
                ? t("orderStatus.confirmExtend")
                : t("orderStatus.confirmPrep")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPickingMode(null);
                setCustomMins("");
              }}
              className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-[11px] font-semibold text-gray-300"
            >
              {t("orderStatus.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {fulfillment.status === "preparing" && !showMinutesPicker ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => setPickingMode("extend")}
            className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-[11px] font-semibold text-amber-100 hover:bg-amber-950/50 disabled:opacity-50"
          >
            {t("orderStatus.addTime")}
          </button>
        </div>
      ) : null}

      {fulfillment.status === "preparing" || fulfillment.status === "ready" ? (
        <div className="flex flex-wrap items-center gap-5">
          <button
            type="button"
            disabled={busy || fulfillment.status !== "preparing"}
            onClick={() => void patch({ action: "mark_ready" })}
            className="rounded-lg border border-emerald-700/60 bg-emerald-900/30 px-3 py-2 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && fulfillment.status === "preparing"
              ? t("orderStatus.saving")
              : t("orderStatus.markReady")}
          </button>
          <button
            type="button"
            disabled={busy || fulfillment.status !== "ready"}
            onClick={() => void patch({ action: "deliver" })}
            className="rounded-lg border border-sky-700/60 bg-sky-950/30 px-3 py-2 text-[11px] font-semibold text-sky-200 hover:bg-sky-950/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && fulfillment.status === "ready"
              ? t("orderStatus.saving")
              : t("orderStatus.markDelivered")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
