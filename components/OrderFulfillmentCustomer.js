import { useCallback, useEffect, useState } from "react";
import {
  clearActiveOrderResume,
  isOpenFulfillmentStatus,
} from "@/utils/activeOrderResume";
import { bindCustomerOrderPush } from "@/utils/bindCustomerOrderPush";
import {
  getCustomerLocalPushSubscribed,
  registerPwaCustomerPushOnUserAction,
} from "@/utils/customerPushClient";
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
 *   cancelSecret?: string | null,
 *   orderId?: string | null,
 * }} props
 */
export default function OrderFulfillmentCustomer({
  orderNumber,
  t,
  className = "",
  onStatus,
  cancelSecret = null,
  orderId: orderIdProp = null,
}) {
  const [fulfillment, setFulfillment] = useState(null);
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState("");
  const [gone, setGone] = useState(false);
  const [pushOffer, setPushOffer] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  const [canCancel, setCanCancel] = useState(false);
  const [cancelEndsAtMs, setCancelEndsAtMs] = useState(null);
  const [orderId, setOrderId] = useState(
    orderIdProp != null && String(orderIdProp).trim() !== ""
      ? String(orderIdProp).trim()
      : ""
  );
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState("");

  const on = String(orderNumber ?? "").trim();
  const secret =
    cancelSecret != null && String(cancelSecret).trim() !== ""
      ? String(cancelSecret).trim()
      : "";

  const refreshPushOffer = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (typeof Notification === "undefined") {
      setPushOffer(false);
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushOffer(false);
      return;
    }
    // מסתירים רק אם כבר רשום לקבלת התראות; אחרת תמיד מציגים «אפשר התראות»
    if (Notification.permission === "granted") {
      const subbed = await getCustomerLocalPushSubscribed();
      setPushOffer(!subbed);
      return;
    }
    setPushOffer(true);
  }, []);

  const load = useCallback(async () => {
    if (!on || !/^\d{3,8}$/.test(on)) return;
    try {
      const r = await fetch(
        `/api/orders/status?on=${encodeURIComponent(on)}&_=${Date.now()}`,
        { cache: "no-store" }
      );
      const d = await r.json().catch(() => ({}));
      if (r.status === 404 || d.error === "not_found") {
        clearActiveOrderResume();
        setGone(true);
        setFulfillment(null);
        setCanCancel(false);
        setCancelEndsAtMs(null);
        setErr("");
        if (typeof onStatus === "function") onStatus("cancelled");
        return;
      }
      if (!r.ok) {
        setErr(t("orderStatus.errLoad"));
        return;
      }
      setGone(false);
      setErr("");
      const f = d.fulfillment || null;
      setFulfillment(f);
      setCanCancel(Boolean(d.canCancel));
      const ends = d.cancelEndsAt ? Date.parse(String(d.cancelEndsAt)) : NaN;
      setCancelEndsAtMs(Number.isFinite(ends) ? ends : null);
      if (d.orderId != null && String(d.orderId).trim() !== "") {
        setOrderId(String(d.orderId).trim());
      }
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
    if (
      orderIdProp != null &&
      String(orderIdProp).trim() !== ""
    ) {
      setOrderId(String(orderIdProp).trim());
    }
  }, [orderIdProp]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshPushOffer();
  }, [refreshPushOffer]);

  // אחרי חסימה בהגדרות הטלפון — כשחוזרים למסך בודקים שוב אם אפשר להציג לחצן
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshPushOffer();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshPushOffer]);

  useEffect(() => {
    if (!on) return;
    void bindCustomerOrderPush(on);
  }, [on]);

  const enablePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushMsg("");
    const r = await registerPwaCustomerPushOnUserAction();
    if (r.ok) {
      await bindCustomerOrderPush(on);
      setPushOffer(false);
      setPushMsg(t("orderStatus.pushEnabledOk"));
      window.setTimeout(() => setPushMsg(""), 2500);
    } else if (r.error === "permission_denied") {
      // חסום בהגדרות — משאירים את הלחצן; בלי התראות זה בסדר
      setPushMsg("");
    } else if (
      r.error === "no_vapid" ||
      r.error === "redis_not_configured"
    ) {
      setPushMsg(t("orderStatus.pushUnavailable"));
    } else {
      setPushMsg(t("orderStatus.pushSubscribeErr"));
    }
    setPushBusy(false);
    await refreshPushOffer();
  };

  const cancelOrder = async () => {
    if (cancelBusy || !orderId || !secret) return;
    setCancelBusy(true);
    setCancelErr("");
    try {
      const r = await fetch("/api/orders/customer-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, cancelSecret: secret }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setCancelErr(t("orderStatus.cancelFailed"));
        setCancelBusy(false);
        await load();
        return;
      }
      clearActiveOrderResume();
      setGone(true);
      setCanCancel(false);
      setCancelEndsAtMs(null);
      setFulfillment(d.fulfillment || { status: "cancelled" });
      if (typeof onStatus === "function") onStatus("cancelled");
    } catch {
      setCancelErr(t("orderStatus.cancelFailed"));
    }
    setCancelBusy(false);
  };

  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(id);
  }, [on, load]);

  useEffect(() => {
    const needsTick =
      (fulfillment && fulfillment.status === "preparing") ||
      (canCancel && cancelEndsAtMs != null);
    if (!needsTick) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [fulfillment?.status, fulfillment?.prepEndsAt, canCancel, cancelEndsAtMs]);

  if (!on) return null;

  void tick;
  const now = Date.now();
  const resolved = fulfillment
    ? resolveFulfillment({ fulfillment }, now)
    : null;
  const remaining = resolved ? prepRemainingMs(resolved, now) : null;
  const cancelRemainMs =
    canCancel && cancelEndsAtMs != null
      ? Math.max(0, cancelEndsAtMs - now)
      : 0;
  const showCancel =
    Boolean(secret) &&
    Boolean(orderId) &&
    !gone &&
    resolved?.status === "pending" &&
    canCancel &&
    cancelRemainMs > 0;

  return (
    <div
      className={`w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900/70 p-3 text-center ${className}`}
      dir="rtl"
    >
      <p className="text-[11px] font-semibold text-gray-400">
        {t("orderStatus.customerTitle")}
      </p>
      {gone ? (
        <div
          className={`mt-2 inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-extrabold ${fulfillmentStatusToneClass(
            "rejected"
          )}`}
        >
          {t("orderStatus.cancelled")}
        </div>
      ) : err ? (
        <p className="mt-1 text-xs text-amber-200">{err}</p>
      ) : resolved ? (
        <>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <div
              className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-extrabold ${fulfillmentStatusToneClass(
                resolved.status
              )}${
                resolved.status === "pending"
                  ? " order-pending-status-blink"
                  : ""
              }`}
            >
              {t(fulfillmentStatusLabelKey(resolved.status))}
            </div>
            {showCancel ? (
              <button
                type="button"
                disabled={cancelBusy}
                onClick={() => void cancelOrder()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/60 bg-red-950/50 px-2.5 py-1.5 text-xs font-bold text-red-200 hover:bg-red-900/50 disabled:opacity-50"
              >
                <span>
                  {cancelBusy
                    ? t("orderStatus.cancelling")
                    : t("orderStatus.cancelOrder")}
                </span>
                <span className="tabular-nums text-red-100/90">
                  {formatCountdown(cancelRemainMs)}
                </span>
              </button>
            ) : null}
          </div>
          {cancelErr ? (
            <p className="mt-1 text-[11px] text-amber-200">{cancelErr}</p>
          ) : null}
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

      {!gone && pushOffer ? (
        <div className="mt-3 space-y-2 border-t border-slate-700/80 pt-3">
          <p className="text-[11px] leading-snug text-gray-300">
            {t("orderStatus.pushEnableHint")}
          </p>
          <button
            type="button"
            disabled={pushBusy}
            onClick={() => void enablePush()}
            className="w-full rounded-lg border border-primary/50 bg-primary/15 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/25 disabled:opacity-50"
          >
            {pushBusy
              ? t("orderStatus.pushEnabling")
              : t("orderStatus.pushEnableBtn")}
          </button>
          {pushMsg ? (
            <p className="mt-1 text-[11px] text-amber-200/90">{pushMsg}</p>
          ) : null}
        </div>
      ) : null}
      {!gone && !pushOffer && pushMsg ? (
        <p className="mt-2 text-[11px] text-emerald-300/90">{pushMsg}</p>
      ) : null}
    </div>
  );
}
