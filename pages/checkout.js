import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import {
  useCart,
  cartLineProductId,
  lineHasUnavailableInventory,
} from "@/hooks/useCart";
import { useLocale } from "@/contexts/LocaleContext";
import { useInventory } from "@/contexts/InventoryContext";
import { useOrderingHours } from "@/contexts/OrderingHoursContext";
import { PAYMENT_METHODS } from "@/utils/payment";
import { buildWhatsAppUrl } from "@/utils/whatsapp";
import { formatIls, lineTotal, safePrice } from "@/utils/cartMoney";
import { RESTAURANT_COORDS } from "@/utils/deliveryPricing";
import {
  PENDING_ORDER_KEY,
  CHECKOUT_RESUME_KEY,
} from "@/utils/checkoutSessionKeys";

const DeliveryMapPicker = dynamic(
  () => import("@/components/DeliveryMapPicker"),
  { ssr: false }
);

function buildCheckoutDraftSnapshot(form, geo, deliveryMapPoint) {
  return {
    form: {
      name: form.name,
      phone: form.phone,
      orderType: form.orderType,
      payment: form.payment,
      deliveryZone: form.deliveryZone,
      addressDetail: form.addressDetail,
      deliveryPayTo: form.deliveryPayTo,
    },
    geo: {
      status: geo.status,
      km: geo.km,
      fee: geo.fee,
      error: geo.error,
      routingMode: geo.routingMode,
    },
    deliveryMapPoint: deliveryMapPoint
      ? {
          lat: deliveryMapPoint.lat,
          lng: deliveryMapPoint.lng,
          label: deliveryMapPoint.label,
        }
      : null,
  };
}

export default function CheckoutPage() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { orderingAllowed } = useOrderingHours();
  const { items, total, updateQuantity, removeItem, clearCart } = useCart();
  const { isUnavailable, refresh: refreshInventory } = useInventory();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    orderType: "delivery",
    payment: "cash",
    deliveryZone: "",
    addressDetail: "",
    deliveryPayTo: "",
  });

  const [geo, setGeo] = useState({
    status: "idle",
    km: null,
    fee: null,
    error: null,
    routingMode: null,
  });

  const [deliveryMapPoint, setDeliveryMapPoint] = useState(null);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapApplyError, setMapApplyError] = useState("");

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const foodTotal = total;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(CHECKOUT_RESUME_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.form && typeof d.form === "object") {
        setForm((prev) => ({ ...prev, ...d.form }));
      }
      if (d.geo && typeof d.geo === "object") {
        setGeo({
          status: d.geo.status ?? "idle",
          km: d.geo.km ?? null,
          fee: d.geo.fee ?? null,
          error: d.geo.error ?? null,
          routingMode: d.geo.routingMode ?? null,
        });
      }
      if (Object.prototype.hasOwnProperty.call(d, "deliveryMapPoint")) {
        setDeliveryMapPoint(d.deliveryMapPoint || null);
      }
    } catch {
      /* ignore */
    }
    try {
      window.sessionStorage.removeItem(CHECKOUT_RESUME_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const deliveryFeeNis = useMemo(() => {
    if (form.orderType !== "delivery") return 0;
    if (
      (form.deliveryZone === "yarka" || form.deliveryZone === "outside") &&
      geo.status === "ok" &&
      deliveryMapPoint &&
      geo.fee != null
    ) {
      return geo.fee;
    }
    return null;
  }, [
    form.orderType,
    form.deliveryZone,
    geo.status,
    geo.fee,
    deliveryMapPoint,
  ]);

  const grandTotal = useMemo(() => {
    if (form.orderType !== "delivery") return foodTotal;
    if (deliveryFeeNis == null) return foodTotal;
    return foodTotal + deliveryFeeNis;
  }, [foodTotal, form.orderType, deliveryFeeNis]);

  /** סכום לביט / אשראי אונליין: מלא או מזון בלבד אם משלמים דמי משלוח לשליח בנפרד */
  const onlinePayAmount = useMemo(() => {
    if (form.orderType !== "delivery" || deliveryFeeNis == null) {
      return grandTotal;
    }
    if (form.deliveryPayTo === "courier_delivery") return foodTotal;
    return grandTotal;
  }, [
    form.orderType,
    form.deliveryPayTo,
    deliveryFeeNis,
    foodTotal,
    grandTotal,
  ]);

  const needsOnlineDeliverySplit =
    form.orderType === "delivery" &&
    deliveryFeeNis != null &&
    (form.payment === "bit" || form.payment === "card");

  const selectPayment = (id) => {
    setForm((prev) => ({
      ...prev,
      payment: id,
      deliveryPayTo:
        id !== "cash" && prev.payment === "cash" ? "" : prev.deliveryPayTo,
    }));
  };

  useEffect(() => {
    if (!orderingAllowed) return;
    setErrors((prev) => {
      if (!prev.orderingClosed) return prev;
      const next = { ...prev };
      delete next.orderingClosed;
      return next;
    });
  }, [orderingAllowed]);

  useEffect(() => {
    if (form.orderType === "pickup") {
      setForm((prev) => ({
        ...prev,
        deliveryZone: "",
        addressDetail: "",
        deliveryPayTo: "",
      }));
      setGeo({
        status: "idle",
        km: null,
        fee: null,
        error: null,
        routingMode: null,
      });
      setDeliveryMapPoint(null);
    }
  }, [form.orderType]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const setZone = (zone) => {
    setForm((prev) => ({
      ...prev,
      deliveryZone: zone,
      deliveryPayTo: "",
    }));
    setDeliveryMapPoint(null);
    setGeo({
      status: "idle",
      km: null,
      fee: null,
      error: null,
      routingMode: null,
    });
  };

  const openMapPicker = () => {
    setMapApplyError("");
    setMapPickerOpen(true);
  };

  const applyDeliveryMapPoint = async (lat, lng) => {
    setMapApplyError("");
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      setMapApplyError(t("checkout.mapErrBadCoords"));
      setGeo({
        status: "error",
        km: null,
        fee: null,
        error: "bad_coords",
        routingMode: null,
      });
      return;
    }
    setGeo({
      status: "loading",
      km: null,
      fee: null,
      error: null,
      routingMode: null,
    });
    try {
      const r = await fetch(
        `/api/delivery-distance?lat=${encodeURIComponent(String(latN))}&lon=${encodeURIComponent(
          String(lngN)
        )}`
      );
      let data = {};
      try {
        data = await r.json();
      } catch {
        data = {};
      }
      if (!data.ok) {
        const err = data.error || "unknown";
        setGeo({
          status: "error",
          km: null,
          fee: null,
          error: err,
          routingMode: null,
        });
        const msg =
          err === "out_of_bounds"
            ? t("checkout.mapErrBounds")
            : err === "fee"
              ? t("checkout.mapErrFee")
              : err === "bad_coords"
                ? t("checkout.mapErrBadCoords")
                : err === "server"
                  ? t("checkout.mapErrServer")
                  : err === "bad_query"
                    ? t("checkout.mapErrBadQuery")
                    : t("checkout.mapErrGeneric");
        setMapApplyError(msg);
        return;
      }
      setDeliveryMapPoint({
        lat: latN,
        lng: lngN,
        label: data.displayName || t("checkout.mapAddressFallback"),
      });
      setGeo({
        status: "ok",
        km: data.km,
        fee: data.fee,
        error: null,
        routingMode: data.routingMode || "driving",
      });
      setMapPickerOpen(false);
    } catch {
      setGeo({
        status: "error",
        km: null,
        fee: null,
        error: "network",
        routingMode: null,
      });
      setMapApplyError(t("checkout.mapErrNetwork"));
    }
  };

  const buildCustomer = () => {
    const base = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      orderType: form.orderType,
    };
    if (form.orderType === "pickup") {
      return { ...base, address: t("checkout.pickupBranch") };
    }
    let addressLine = "";
    const main =
      deliveryMapPoint?.label ||
      (deliveryMapPoint ? t("checkout.mapAddressFallback") : "");
    const note = form.addressDetail.trim();
    if (form.deliveryZone === "yarka") {
      const zonePrefix = t("checkout.zoneYarka");
      const core = main ? `${zonePrefix}: ${main}` : zonePrefix;
      addressLine = [core, note].filter(Boolean).join(" — ");
    } else {
      addressLine = [main, note].filter(Boolean).join(" — ");
    }
    return {
      ...base,
      address: addressLine,
      deliveryZone: form.deliveryZone,
      deliveryFeeNis:
        deliveryFeeNis != null ? deliveryFeeNis : undefined,
      deliveryDistanceKm:
        (form.deliveryZone === "yarka" || form.deliveryZone === "outside") &&
        geo.status === "ok" &&
        geo.km != null
          ? geo.km
          : null,
      deliveryRouteMode:
        (form.deliveryZone === "yarka" || form.deliveryZone === "outside") &&
        geo.status === "ok"
          ? geo.routingMode
          : null,
      deliveryPayTo:
        form.orderType === "delivery" && deliveryFeeNis != null
          ? form.payment === "cash"
            ? "courier_all_cash"
            : form.deliveryPayTo || undefined
          : undefined,
      foodTotalNis: foodTotal,
    };
  };

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = t("err.name");
    if (!form.phone.trim()) newErrors.phone = t("err.phone");
    if (!items.length) newErrors.cart = t("err.cart");
    if (items.some((line) => lineHasUnavailableInventory(line, isUnavailable))) {
      newErrors.unavailable = t("err.unavailable");
    }
    if (!orderingAllowed) {
      newErrors.orderingClosed = t("err.orderingClosed");
    }

    if (form.orderType === "delivery") {
      if (!form.deliveryZone) {
        newErrors.deliveryZone = t("err.deliveryZone");
      }
      if (form.deliveryZone === "yarka" || form.deliveryZone === "outside") {
        if (!deliveryMapPoint) {
          newErrors.address = t("err.mapRequired");
        } else if (geo.status !== "ok") {
          newErrors.deliveryGeocode = t("err.deliveryGeocode");
        }
      }
      if (
        deliveryFeeNis != null &&
        (form.payment === "bit" || form.payment === "card")
      ) {
        if (
          form.deliveryPayTo !== "restaurant_all" &&
          form.deliveryPayTo !== "courier_delivery"
        ) {
          newErrors.deliveryPayTo = t("err.deliveryPayTo");
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.submit;
      delete next.unavailable;
      delete next.orderingClosed;
      return next;
    });

    const orderId = Date.now().toString();
    const customer = buildCustomer();
    const persistTotal = grandTotal;

    const persistOrder = async (channel) => {
      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer,
            items,
            total: persistTotal,
            payment: form.payment,
            channel,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          return {
            order: null,
            error: data?.error || "request_failed",
          };
        }
        return { order: data?.order || null, error: null };
      } catch {
        return { order: null, error: "network" };
      }
    };

    try {
      if (form.payment === "cash") {
        const { order: savedOrder, error: poErr } =
          await persistOrder("checkout_cash");
        if (poErr === "item_unavailable") {
          await refreshInventory();
          setErrors((prev) => ({
            ...prev,
            unavailable: t("err.unavailable"),
          }));
          return;
        }
        if (poErr === "ordering_closed") {
          setErrors((prev) => ({
            ...prev,
            orderingClosed: t("err.orderingClosed"),
          }));
          return;
        }
        const waUrl = buildWhatsAppUrl({
          customer,
          cart: { items },
          total: persistTotal,
          payment: form.payment,
          orderNumber: savedOrder?.orderNumber,
          locale,
        });
        if (typeof window !== "undefined") {
          window.open(waUrl, "_blank");
        }
        clearCart();
        router.push("/success?method=cash");
        return;
      }

      if (form.payment === "bit") {
        const { order: savedOrder, error: poErr } =
          await persistOrder("checkout_bit");
        if (poErr === "item_unavailable") {
          await refreshInventory();
          setErrors((prev) => ({
            ...prev,
            unavailable: t("err.unavailable"),
          }));
          return;
        }
        if (poErr === "ordering_closed") {
          setErrors((prev) => ({
            ...prev,
            orderingClosed: t("err.orderingClosed"),
          }));
          return;
        }
        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(
              PENDING_ORDER_KEY,
              JSON.stringify({
                customer,
                items,
                payment: form.payment,
                orderNumber: savedOrder?.orderNumber,
                locale,
                waGrandTotal: persistTotal,
                checkoutDraft: buildCheckoutDraftSnapshot(
                  form,
                  geo,
                  deliveryMapPoint
                ),
              })
            );
          } catch {
            /* ignore */
          }
        }

        clearCart();
        router.push(
          `/pay/bit?amount=${encodeURIComponent(
            formatIls(onlinePayAmount)
          )}&to=${encodeURIComponent("0504847599")}`
        );
        return;
      }

      const { order: savedCardOrder, error: cardPoErr } =
        await persistOrder("checkout_card");
      if (cardPoErr === "item_unavailable") {
        await refreshInventory();
        setErrors((prev) => ({
          ...prev,
          unavailable: t("err.unavailable"),
        }));
        return;
      }
      if (cardPoErr === "ordering_closed") {
        setErrors((prev) => ({
          ...prev,
          orderingClosed: t("err.orderingClosed"),
        }));
        return;
      }
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(
            PENDING_ORDER_KEY,
            JSON.stringify({
              customer,
              items,
              payment: form.payment,
              orderNumber: savedCardOrder?.orderNumber,
              locale,
              waGrandTotal: persistTotal,
              cardOnlinePayAmount: onlinePayAmount,
              cardUniqueId: orderId,
              checkoutDraft: buildCheckoutDraftSnapshot(
                form,
                geo,
                deliveryMapPoint
              ),
            })
          );
        } catch {
          /* ignore */
        }
        clearCart();
        router.push(
          `/pay/card?amount=${encodeURIComponent(
            formatIls(onlinePayAmount)
          )}&orderId=${encodeURIComponent(orderId)}`
        );
        return;
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <section className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="mb-1 text-lg font-bold">{t("checkout.title")}</h2>
            <p className="text-xs text-gray-400">{t("checkout.subtitle")}</p>
          </div>
          <Link
            href="/"
            className="shrink-0 self-start rounded-full border border-slate-600 bg-slate-900/60 px-4 py-2 text-center text-xs font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-slate-800/60 sm:self-center"
          >
            {t("checkout.backToMenu")}
          </Link>
        </div>
        {!orderingAllowed ? (
          <p
            className="mt-3 rounded-xl border border-amber-800/60 bg-amber-950/40 p-3 text-sm font-medium text-amber-100"
            role="status"
          >
            {t("err.orderingClosed")}
          </p>
        ) : null}
      </section>

      {!items.length ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-gray-400">
          {t("checkout.emptyCart")}
        </p>
      ) : (
        <section className="mb-4 card p-3 text-xs">
          <h3 className="mb-2 text-sm font-semibold">{t("checkout.summary")}</h3>
          <div className="space-y-2">
            {items.map((item, index) => {
              const pid = cartLineProductId(item);
              const lineOos = lineHasUnavailableInventory(item, isUnavailable);
              return (
                <div
                  key={`${item.id}-${index}`}
                  className="flex items-start justify-between gap-2 rounded-lg bg-slate-900/70 p-2"
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{item.name}</p>
                    {item.sizeLabel && (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.size")}: {item.sizeLabel}
                      </p>
                    )}
                    {item.variantLabel && (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.variant")}: {item.variantLabel}
                      </p>
                    )}
                    {item.salads?.length ? (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.saladsPrefix")}:{" "}
                        {item.salads.map((x) => x.label).join(", ")}
                      </p>
                    ) : null}
                    {item.toppings?.length ? (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.toppingsPrefix")}:{" "}
                        {item.toppings.map((x) => x.label).join(", ")}
                      </p>
                    ) : null}
                    {item.extras?.length ? (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.extrasPrefix")}:{" "}
                        {item.extras.map((x) => x.label).join(", ")}
                      </p>
                    ) : null}
                    {item.sellerNotes ? (
                      <p className="mt-1 text-[11px] text-amber-200/90">
                        {t("ui.sellerNotes")}: {item.sellerNotes}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-gray-400">
                      {t("checkout.unitPrice")}: ₪{formatIls(safePrice(item))}
                    </p>
                    {lineOos ? (
                      <p className="mt-1 text-sm font-extrabold leading-snug text-red-500">
                        {t("ui.outOfStock")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.id, item.quantity - 1)
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 text-xs"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.id, item.quantity + 1)
                        }
                        disabled={lineOos}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-[11px] text-red-400"
                    >
                      {t("checkout.remove")}
                    </button>
                    <p className="text-sm font-semibold">
                      ₪{formatIls(lineTotal(item))}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {t("checkout.foodSubtotal")}
              </span>
              <span className="text-sm font-semibold text-gray-200">
                ₪{formatIls(foodTotal)}
              </span>
            </div>
            {form.orderType === "delivery" && deliveryFeeNis != null ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {t("checkout.deliveryFeeLine")}
                  </span>
                  <span className="text-sm font-semibold text-gray-200">
                    ₪{formatIls(deliveryFeeNis)}
                  </span>
                </div>
                {(form.deliveryZone === "outside" ||
                  form.deliveryZone === "yarka") &&
                geo.status === "ok" &&
                geo.km != null ? (
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-gray-500">
                      {geo.routingMode === "air_fallback"
                        ? t("checkout.distanceKm")
                        : t("checkout.drivingDistanceKm")}
                      : {geo.km.toFixed(1)} km
                    </p>
                    {geo.routingMode === "air_fallback" ? (
                      <p className="text-[10px] text-amber-200/90">
                        {t("checkout.airFallbackNote")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : form.orderType === "delivery" &&
              (form.deliveryZone === "outside" ||
                form.deliveryZone === "yarka") ? (
              <p className="text-[10px] text-amber-200/80">
                {t("checkout.mapSelectHint")}
              </p>
            ) : null}
            <div className="flex items-center justify-between border-t border-slate-800 pt-2">
              <span className="text-xs font-medium text-gray-300">
                {t("checkout.grandTotal")}
              </span>
              <span className="text-base font-bold text-primary">
                ₪{formatIls(grandTotal)}
              </span>
            </div>
          </div>
        </section>
      )}

      <form
        onSubmit={handleSubmit}
        className="card space-y-3 p-3 text-xs"
        noValidate
      >
        <h3 className="text-sm font-semibold">{t("checkout.customer")}</h3>

        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[11px] text-gray-300">
              {t("checkout.fullName")}
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs outline-none focus:border-primary"
              placeholder={t("checkout.namePh")}
            />
            {errors.name && (
              <p className="mt-1 text-[11px] text-red-400">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-gray-300">
              {t("checkout.phone")}
            </label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs outline-none focus:border-primary"
              placeholder="05XXXXXXXX"
            />
            {errors.phone && (
              <p className="mt-1 text-[11px] text-red-400">{errors.phone}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-gray-300">
              {t("checkout.orderType")}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, orderType: "delivery" }))
                }
                className={`flex-1 rounded-full border px-3 py-1 text-[11px] ${
                  form.orderType === "delivery"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-700 text-gray-300"
                }`}
              >
                {t("checkout.delivery")}
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, orderType: "pickup" }))
                }
                className={`flex-1 rounded-full border px-3 py-1 text-[11px] ${
                  form.orderType === "pickup"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-700 text-gray-300"
                }`}
              >
                {t("checkout.pickup")}
              </button>
            </div>
          </div>

          {form.orderType === "delivery" && (
            <>
              <div>
                <label className="mb-1 block text-[11px] text-gray-300">
                  {t("checkout.deliveryWhere")}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setZone("yarka")}
                    className={`flex-1 rounded-full border px-3 py-2 text-[11px] font-semibold ${
                      form.deliveryZone === "yarka"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-slate-700 text-gray-300"
                    }`}
                  >
                    {t("checkout.zoneYarka")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setZone("outside")}
                    className={`flex-1 rounded-full border px-3 py-2 text-[11px] font-semibold ${
                      form.deliveryZone === "outside"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-slate-700 text-gray-300"
                    }`}
                  >
                    {t("checkout.zoneOutside")}
                  </button>
                </div>
                {errors.deliveryZone && (
                  <p className="mt-1 text-[11px] text-red-400">
                    {errors.deliveryZone}
                  </p>
                )}
              </div>

              {(form.deliveryZone === "yarka" ||
                form.deliveryZone === "outside") && (
                <div className="relative space-y-2">
                  <label
                    className="mb-1 block text-[11px] text-gray-300"
                    htmlFor="delivery-address-trigger"
                  >
                    {t("checkout.address")}
                  </label>
                  <button
                    id="delivery-address-trigger"
                    type="button"
                    onClick={openMapPicker}
                    className="flex min-h-[2.75rem] w-full items-start rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-left text-xs outline-none ring-primary/40 focus:border-primary focus:ring-2"
                  >
                    <span
                      className={
                        deliveryMapPoint?.label
                          ? "text-gray-200"
                          : "text-gray-500"
                      }
                    >
                      {deliveryMapPoint?.label ||
                        t("checkout.mapOpenField")}
                    </span>
                  </button>
                  {deliveryMapPoint ? (
                    <button
                      type="button"
                      onClick={openMapPicker}
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      {t("checkout.mapChange")}
                    </button>
                  ) : null}
                  {geo.status === "loading" ? (
                    <p className="text-[10px] text-gray-500">
                      {t("checkout.geocoding")}
                    </p>
                  ) : null}
                  {geo.status === "error" && !mapPickerOpen ? (
                    <p className="text-[11px] text-red-400">
                      {t("checkout.geocodeFail")}
                    </p>
                  ) : null}
                  <div>
                    <label className="mb-1 block text-[11px] text-gray-400">
                      {t("checkout.outsideNotesOptional")}
                    </label>
                    <textarea
                      name="addressDetail"
                      value={form.addressDetail}
                      onChange={handleChange}
                      rows={2}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs outline-none focus:border-primary"
                      placeholder={t("checkout.outsideNotesPh")}
                    />
                  </div>
                  {errors.address && (
                    <p className="mt-1 text-[11px] text-red-400">
                      {errors.address}
                    </p>
                  )}
                  {errors.deliveryGeocode && (
                    <p className="mt-1 text-[11px] text-red-400">
                      {errors.deliveryGeocode}
                    </p>
                  )}
                </div>
              )}

            </>
          )}
        </div>

        <div className="mt-2 border-t border-slate-800 pt-3">
          <h3 className="mb-2 text-sm font-semibold">{t("checkout.payment")}</h3>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => selectPayment(m.id)}
                className={`rounded-full border px-3 py-2 text-[11px] ${
                  form.payment === m.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-700 text-gray-300"
                }`}
              >
                {t(`payment.${m.id}`)}
              </button>
            ))}
          </div>
        </div>

        {form.orderType === "delivery" && deliveryFeeNis != null ? (
          <div className="mt-3 space-y-2 rounded-xl border border-slate-700/80 bg-slate-900/40 p-3">
            {form.payment === "cash" ? (
              <>
                <h4 className="text-[11px] font-semibold text-gray-200">
                  {t("checkout.deliveryPayCashTitle")}
                </h4>
                <p className="text-[11px] leading-snug text-gray-400">
                  {t("checkout.cashCourierFullHint")}
                </p>
                <p className="text-sm font-bold text-primary">
                  {t("checkout.cashCourierTotalLabel")}: ₪
                  {formatIls(grandTotal)}
                </p>
              </>
            ) : needsOnlineDeliverySplit ? (
              <>
                <h4 className="text-[11px] font-semibold text-gray-200">
                  {t("checkout.deliveryPayOnlineTitle")}
                </h4>
                <p className="mb-2 text-[10px] leading-snug text-gray-500">
                  {t("checkout.deliveryPayOnlineHint")}
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        deliveryPayTo: "restaurant_all",
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-left text-[11px] leading-snug ${
                      form.deliveryPayTo === "restaurant_all"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-slate-700 text-gray-300"
                    }`}
                  >
                    {t("checkout.payRestaurantAll")}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        deliveryPayTo: "courier_delivery",
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-left text-[11px] leading-snug ${
                      form.deliveryPayTo === "courier_delivery"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-slate-700 text-gray-300"
                    }`}
                  >
                    {t("checkout.payCourierDeliveryFoodPrefix")}
                    {t(`payment.${form.payment}`)}
                    {t("checkout.payCourierDeliveryFoodSuffix")}
                  </button>
                </div>
                {form.deliveryPayTo === "courier_delivery" ? (
                  <p className="text-[10px] leading-snug text-amber-200/85">
                    <span>{t("checkout.onlinePayFoodOnlyLabel")}</span>{" "}
                    <span className="font-semibold text-amber-100">
                      ₪{formatIls(foodTotal)}
                    </span>
                    . {t("checkout.onlinePayDeliveryToCourier")}
                  </p>
                ) : form.deliveryPayTo === "restaurant_all" ? (
                  <p className="text-[10px] leading-snug text-gray-500">
                    <span>{t("checkout.onlinePayFullLabel")}</span>{" "}
                    <span className="font-semibold text-gray-300">
                      ₪{formatIls(grandTotal)}
                    </span>
                    .
                  </p>
                ) : null}
                {errors.deliveryPayTo && (
                  <p className="text-[11px] text-red-400">
                    {errors.deliveryPayTo}
                  </p>
                )}
              </>
            ) : null}
          </div>
        ) : null}

        {errors.cart && (
          <p className="text-[11px] text-red-400">{errors.cart}</p>
        )}
        {errors.unavailable && (
          <p className="text-[11px] text-red-400">{errors.unavailable}</p>
        )}
        {errors.orderingClosed && (
          <p className="text-[11px] text-red-400">{errors.orderingClosed}</p>
        )}
        {errors.submit && (
          <p className="whitespace-pre-line text-[11px] text-red-400">
            {errors.submit}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !items.length || !orderingAllowed}
          className="btn-primary flex w-full items-center justify-center gap-2 text-sm"
        >
          {isSubmitting ? t("checkout.submitting") : t("checkout.submit")}
        </button>
      </form>

      <DeliveryMapPicker
        open={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        centerLat={RESTAURANT_COORDS.lat}
        centerLng={RESTAURANT_COORDS.lng}
        labels={{
          title: t("checkout.mapTitle"),
          hint: t("checkout.mapTapHint"),
          confirm: t("checkout.mapConfirm"),
          cancel: t("checkout.mapCancel"),
          applying: t("checkout.mapApplying"),
        }}
        isApplying={geo.status === "loading"}
        applyError={mapApplyError}
        onConfirm={(lat, lng) => applyDeliveryMapPoint(lat, lng)}
      />
    </Layout>
  );
}
