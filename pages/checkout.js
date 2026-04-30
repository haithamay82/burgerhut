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
import { useMealWizard } from "@/contexts/MealWizardContext";
import {
  isEditableMealCartLine,
  mealCatalogItemForCartLine,
} from "@/utils/mealCartLineEdit";
import { useLocale } from "@/contexts/LocaleContext";
import { useInventory } from "@/contexts/InventoryContext";
import { useMenuCatalog } from "@/contexts/MenuCatalogContext";
import { useOrderingHours } from "@/contexts/OrderingHoursContext";
import { PAYMENT_METHODS } from "@/utils/payment";
import { formatIls, lineTotal, safePrice } from "@/utils/cartMoney";
import { RESTAURANT_COORDS } from "@/utils/deliveryPricing";
import {
  PENDING_ORDER_KEY,
  CHECKOUT_RESUME_KEY,
  CHECKOUT_SAVED_CONTACT_KEY,
  SUCCESS_WA_SNAPSHOT_KEY,
} from "@/utils/checkoutSessionKeys";
import { insufficientPattiesUiMessage } from "@/utils/pattyCheckoutErrorText";
import {
  pattyCartShortageMessage,
  simulateCartAfterQuantityUpdate,
  validatePattyStockForSimulatedCart,
} from "@/utils/pattyStockClient";
import { sortSaladsForDisplay } from "@/utils/saladDisplayOrder";
import { specialBurgerMenuDescription } from "@/utils/specialBurgerMealDescription";

const DeliveryMapPicker = dynamic(
  () => import("@/components/DeliveryMapPicker"),
  { ssr: false }
);

const CHEDDAR_SAUCE_ID = "sauce_cheddar";
const STANDARD_SAUCE_EXTRA_PRICE = 4;

function buildCheckoutDraftSnapshot(form, geo, deliveryMapPoint) {
  return {
    form: {
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      email: form.email,
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
  const { orderingAllowed, todayScheduledOpen } = useOrderingHours();
  const { items, total, updateQuantity, removeItem, clearCart } = useCart();
  const { isUnavailable, refresh: refreshInventory } = useInventory();
  const { mainMealProductIds, menuItems } = useMenuCatalog();
  const { openMealEditLine } = useMealWizard();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    orderType: "pickup",
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
  const [cartPattyError, setCartPattyError] = useState("");
  /** ברירת מחדל: כן — שמירת שם/טלפון ב־localStorage כשהשדות מלאים */
  const [saveContactChoice, setSaveContactChoice] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discountCfg, setDiscountCfg] = useState({
    enabled: false,
    percent: 0,
    minOrderTotal: 0,
  });
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");

  const rawFoodTotal = total;

  /**
   * כלל גלובלי לרוטבים:
   * לכל מנה עיקרית יש זכאות לרוטב סטנדרטי אחד בחינם, גם אם לא נבחר באותה מנה.
   * צ'דר תמיד בתשלום מלא.
   * אם תמחור שורת עגלה "גבה יותר" מהכלל הגלובלי — מפחיתים כאן מהסכום הסופי.
   */
  const saucePolicyCreditNis = useMemo(() => {
    let eligibleDishUnits = 0;
    let selectedStandardSauceUnits = 0;
    let chargedStandardSauceNis = 0;

    for (const item of items) {
      const qty = Math.max(1, Number(item?.quantity) || 1);
      const pid = cartLineProductId(item);
      if (mainMealProductIds.has(pid)) {
        eligibleDishUnits += qty;
      }
      if (!Array.isArray(item?.extras)) continue;
      for (const ex of item.extras) {
        const exId = String(ex?.id || "");
        if (!exId || exId === CHEDDAR_SAUCE_ID) continue;
        selectedStandardSauceUnits += qty;
        const p = Number(ex?.price);
        if (Number.isFinite(p) && p > 0) {
          chargedStandardSauceNis += p * qty;
        }
      }
    }

    const shouldChargeStandardSauceNis =
      Math.max(0, selectedStandardSauceUnits - eligibleDishUnits) *
      STANDARD_SAUCE_EXTRA_PRICE;
    const credit = Math.max(
      0,
      chargedStandardSauceNis - shouldChargeStandardSauceNis
    );
    return Math.round(credit * 100) / 100;
  }, [items, mainMealProductIds]);

  const foodTotal = useMemo(
    () => Math.max(0, rawFoodTotal - saucePolicyCreditNis),
    [rawFoodTotal, saucePolicyCreditNis]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(CHECKOUT_RESUME_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.form && typeof d.form === "object") {
        const merged = { ...d.form };
        if (merged.payment !== "card") merged.email = "";
        if (
          merged.name &&
          !merged.firstName &&
          !merged.lastName
        ) {
          const parts = String(merged.name).trim().split(/\s+/);
          merged.firstName = parts[0] || "";
          merged.lastName = parts.slice(1).join(" ") || "";
        }
        setForm((prev) => ({ ...prev, ...merged }));
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CHECKOUT_SAVED_CONTACT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;
      const fn = String(saved.firstName || "").trim();
      const ln = String(saved.lastName || "").trim();
      const ph = String(saved.phone || "").trim();
      if (!fn && !ln && !ph) return;
      setForm((prev) => {
        if (
          prev.firstName.trim() ||
          prev.lastName.trim() ||
          prev.phone.trim()
        ) {
          return prev;
        }
        return {
          ...prev,
          firstName: fn,
          lastName: ln,
          phone: ph,
        };
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadDiscount = async () => {
      try {
        const r = await fetch("/api/discount");
        const d = await r.json().catch(() => ({}));
        if (cancelled || !r.ok || !d?.ok) return;
        setDiscountCfg({
          enabled: Boolean(d.enabled),
          percent: Number(d.percent) || 0,
          minOrderTotal: Number(d.minOrderTotal) || 0,
        });
      } catch {
        /* ignore */
      }
    };
    loadDiscount();
    return () => {
      cancelled = true;
    };
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

  const discountAmountNis = useMemo(() => {
    if (!discountCfg.enabled) return 0;
    const p = Number(discountCfg.percent);
    const min = Number(discountCfg.minOrderTotal);
    if (!Number.isFinite(p) || p <= 0) return 0;
    if (!Number.isFinite(min) || foodTotal < min) return 0;
    const raw = (foodTotal * p) / 100;
    return Math.max(0, Math.round(raw * 100) / 100);
  }, [discountCfg.enabled, discountCfg.percent, discountCfg.minOrderTotal, foodTotal]);

  const discountedFoodTotal = useMemo(
    () => Math.max(0, foodTotal - discountAmountNis),
    [foodTotal, discountAmountNis]
  );

  const baseGrandTotal = useMemo(() => {
    if (form.orderType !== "delivery") return discountedFoodTotal;
    if (deliveryFeeNis == null) return discountedFoodTotal;
    return discountedFoodTotal + deliveryFeeNis;
  }, [discountedFoodTotal, form.orderType, deliveryFeeNis]);

  const couponDiscountNis = useMemo(() => {
    const v = Number(appliedCoupon?.value);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.max(0, Math.min(v, baseGrandTotal));
  }, [appliedCoupon, baseGrandTotal]);

  const grandTotal = useMemo(
    () => Math.max(0, baseGrandTotal - couponDiscountNis),
    [baseGrandTotal, couponDiscountNis]
  );

  /** סכום לביט / אשראי אונליין: מלא או מזון בלבד אם משלמים דמי משלוח לשליח בנפרד */
  const onlinePayAmount = useMemo(() => {
    if (form.orderType !== "delivery" || deliveryFeeNis == null) {
      return grandTotal;
    }
    if (form.deliveryPayTo === "courier_delivery") {
      return Math.max(0, discountedFoodTotal - couponDiscountNis);
    }
    return grandTotal;
  }, [
    form.orderType,
    form.deliveryPayTo,
    deliveryFeeNis,
    discountedFoodTotal,
    couponDiscountNis,
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
      ...(id !== "card" && prev.payment === "card" ? { email: "" } : {}),
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

  const applyCoupon = async () => {
    const code = String(couponCodeInput || "").trim().toUpperCase();
    setCouponMsg("");
    if (!code) {
      setAppliedCoupon(null);
      return;
    }
    setCouponBusy(true);
    try {
      const r = await fetch("/api/coupon/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok || !d?.coupon) {
        setAppliedCoupon(null);
        const err = String(d?.error || "");
        if (err === "already_used") {
          setCouponMsg(t("checkout.couponUsed"));
        } else if (err === "expired") {
          setCouponMsg(t("checkout.couponExpired"));
        } else {
          setCouponMsg(t("checkout.couponInvalid"));
        }
        return;
      }
      setAppliedCoupon({
        code: String(d.coupon.code || code),
        value: Number(d.coupon.value) || 0,
        expiresAt: Number(d.coupon.expiresAt) || 0,
      });
      setCouponCodeInput(String(d.coupon.code || code));
      setCouponMsg(t("checkout.couponApplied"));
    } catch {
      setAppliedCoupon(null);
      setCouponMsg(t("checkout.couponInvalid"));
    } finally {
      setCouponBusy(false);
    }
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
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const name = [firstName, lastName].filter(Boolean).join(" ");
    const emailTrim = form.email.trim();
    const base = {
      firstName,
      lastName,
      name,
      phone: form.phone.trim(),
      ...(form.payment === "card" &&
      emailTrim &&
      emailTrim.includes("@")
        ? { email: emailTrim.slice(0, 120) }
        : {}),
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
      foodTotalBeforeDiscountNis: foodTotal,
      discountAmountNis: discountAmountNis || undefined,
      discountPercent:
        discountAmountNis > 0 ? Number(discountCfg.percent) || undefined : undefined,
      discountMinOrderTotal:
        discountAmountNis > 0
          ? Number(discountCfg.minOrderTotal) || undefined
          : undefined,
      foodTotalNis: discountedFoodTotal,
      couponCode: appliedCoupon?.code || undefined,
      couponDiscountNis: couponDiscountNis || undefined,
    };
  };

  const validate = () => {
    const newErrors = {};
    if (!form.firstName.trim()) newErrors.firstName = t("err.firstName");
    if (!form.lastName.trim()) newErrors.lastName = t("err.lastName");
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

  useEffect(() => {
    setCartPattyError("");
  }, [items]);

  const tryBumpCheckoutQuantity = async (item, nextQty) => {
    if (nextQty < 1) return;
    setCartPattyError("");
    const nextLines = simulateCartAfterQuantityUpdate(
      items,
      item.id,
      nextQty
    );
    const hintPid = cartLineProductId(item);
    const check = await validatePattyStockForSimulatedCart(
      nextLines,
      hintPid,
      item.specialPattyGrams
    );
    if (!check.ok) {
      setCartPattyError(pattyCartShortageMessage(t, check));
      return;
    }
    updateQuantity(item.id, nextQty);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = form.firstName.trim();
    const ln = form.lastName.trim();
    const ph = form.phone.trim();
    if (!fn || !ln || !ph) return;
    if (!saveContactChoice) {
      try {
        window.localStorage.removeItem(CHECKOUT_SAVED_CONTACT_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          CHECKOUT_SAVED_CONTACT_KEY,
          JSON.stringify({
            firstName: fn,
            lastName: ln,
            phone: ph,
            savedAt: Date.now(),
          })
        );
      } catch {
        /* ignore */
      }
    }, 450);
    return () => window.clearTimeout(id);
  }, [
    form.firstName,
    form.lastName,
    form.phone,
    saveContactChoice,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setCartPattyError("");
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
    /** בסיס למימוש אחוז הקופון הבא: מזון אחרי מבצע, בלי משלוח; אחרי חלק הקופון שמשויך למזון */
    const appliedCouponToFoodNis = Math.min(
      couponDiscountNis,
      discountedFoodTotal
    );
    const couponRewardBaseNis = Math.max(
      0,
      discountedFoodTotal - appliedCouponToFoodNis
    );

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
            couponCode: appliedCoupon?.code || undefined,
            deferCouponConsume:
              channel === "checkout_bit" || channel === "checkout_card",
            /** אשראי: אחרי Hyp; ביט: אחרי אישור לקוח — לא לשדר לניהול לפני כן */
            ...(channel === "checkout_card" || channel === "checkout_bit"
              ? { deferAdminPush: true }
              : {}),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          return {
            order: null,
            error: data?.error || "request_failed",
            pattyShortfalls: data?.pattyShortfalls,
            pattyAffectedLines: data?.pattyAffectedLines,
            adminPushConfirmSecret: null,
          };
        }
        return {
          order: data?.order || null,
          error: null,
          pattyShortfalls: undefined,
          pattyAffectedLines: undefined,
          adminPushConfirmSecret: data?.adminPushConfirmSecret ?? null,
        };
      } catch {
        return { order: null, error: "network", adminPushConfirmSecret: null };
      }
    };

    try {
      if (form.payment === "cash") {
        const {
          order: savedOrder,
          error: poErr,
          pattyShortfalls: cashPattySf,
          pattyAffectedLines: cashPattyLines,
        } = await persistOrder("checkout_cash");
        if (poErr === "item_unavailable" || poErr === "insufficient_patties") {
          await refreshInventory();
          setErrors((prev) => ({
            ...prev,
            unavailable:
              poErr === "insufficient_patties"
                ? insufficientPattiesUiMessage(t, cashPattySf, cashPattyLines)
                : t("err.unavailable"),
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
        if (
          poErr === "coupon_invalid" ||
          poErr === "coupon_expired" ||
          poErr === "coupon_used"
        ) {
          setErrors((prev) => ({
            ...prev,
            submit:
              poErr === "coupon_used"
                ? t("checkout.couponUsedSubmit")
                : poErr === "coupon_expired"
                  ? t("checkout.couponExpiredSubmit")
                  : t("checkout.couponInvalidSubmit"),
          }));
          return;
        }
        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(
              SUCCESS_WA_SNAPSHOT_KEY,
              JSON.stringify({
                customer,
                items,
                payment: form.payment,
                orderNumber: savedOrder?.orderNumber,
                locale,
                waGrandTotal: persistTotal,
                couponRewardBaseNis,
                orderRowId: savedOrder?.id,
              })
            );
          } catch {
            /* ignore */
          }
        }
        clearCart();
        router.push(
          `/success?method=cash&on=${encodeURIComponent(
            String(savedOrder?.orderNumber ?? "")
          )}`
        );
        return;
      }

      if (form.payment === "bit") {
        const {
          order: savedOrder,
          error: poErr,
          pattyShortfalls: bitPattySf,
          pattyAffectedLines: bitPattyLines,
          adminPushConfirmSecret: bitPushSecret,
        } = await persistOrder("checkout_bit");
        if (poErr === "item_unavailable" || poErr === "insufficient_patties") {
          await refreshInventory();
          setErrors((prev) => ({
            ...prev,
            unavailable:
              poErr === "insufficient_patties"
                ? insufficientPattiesUiMessage(t, bitPattySf, bitPattyLines)
                : t("err.unavailable"),
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
        if (
          poErr === "coupon_invalid" ||
          poErr === "coupon_expired" ||
          poErr === "coupon_used"
        ) {
          setErrors((prev) => ({
            ...prev,
            submit:
              poErr === "coupon_used"
                ? t("checkout.couponUsedSubmit")
                : poErr === "coupon_expired"
                  ? t("checkout.couponExpiredSubmit")
                  : t("checkout.couponInvalidSubmit"),
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
                orderRowId: savedOrder?.id,
                adminPushConfirmSecret: bitPushSecret || undefined,
                locale,
                waGrandTotal: persistTotal,
                couponRewardBaseNis,
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

      const {
        order: savedCardOrder,
        error: cardPoErr,
        pattyShortfalls: cardPattySf,
        pattyAffectedLines: cardPattyLines,
        adminPushConfirmSecret: cardPushSecret,
      } = await persistOrder("checkout_card");
      if (
        cardPoErr === "item_unavailable" ||
        cardPoErr === "insufficient_patties"
      ) {
        await refreshInventory();
        setErrors((prev) => ({
          ...prev,
          unavailable:
            cardPoErr === "insufficient_patties"
              ? insufficientPattiesUiMessage(t, cardPattySf, cardPattyLines)
              : t("err.unavailable"),
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
      if (
        cardPoErr === "coupon_invalid" ||
        cardPoErr === "coupon_expired" ||
        cardPoErr === "coupon_used"
      ) {
        setErrors((prev) => ({
          ...prev,
          submit:
            cardPoErr === "coupon_used"
              ? t("checkout.couponUsedSubmit")
              : cardPoErr === "coupon_expired"
                ? t("checkout.couponExpiredSubmit")
                : t("checkout.couponInvalidSubmit"),
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
              orderRowId: savedCardOrder?.id,
              adminPushConfirmSecret: cardPushSecret || undefined,
              locale,
              waGrandTotal: persistTotal,
              couponRewardBaseNis,
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
      <div className="relative">
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
      </section>

      {!items.length ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-gray-400">
          {t("checkout.emptyCart")}
        </p>
      ) : (
        <section className="mb-4 card p-3 text-xs">
          <h3 className="mb-2 text-sm font-semibold">{t("checkout.summary")}</h3>
          {cartPattyError ? (
            <p className="mb-2 whitespace-pre-line rounded-lg border border-red-500/40 bg-red-950/40 px-2 py-2 text-[11px] font-semibold leading-snug text-red-200">
              {cartPattyError}
            </p>
          ) : null}
          <div className="space-y-2">
            {items.map((item, index) => {
              const lineOos = lineHasUnavailableInventory(item, isUnavailable);
              return (
                <div
                  key={`${item.id}-${index}`}
                  className="flex flex-col gap-2 rounded-lg bg-slate-900/70 p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      {item.quantity > 1 ? (
                        <ol className="mb-0.5 list-inside list-decimal space-y-0.5 text-sm font-semibold text-gray-100">
                          {Array.from(
                            { length: item.quantity },
                            (_, u) => (
                              <li key={u}>{item.name}</li>
                            )
                          )}
                        </ol>
                      ) : (
                        <span className="text-sm font-semibold">{item.name}</span>
                      )}
                    </div>
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
                        {sortSaladsForDisplay(item.salads)
                          .map((x) => x.label)
                          .join(", ")}
                      </p>
                    ) : null}
                    {(() => {
                      const pid = cartLineProductId(item);
                      if (!String(pid).startsWith("special-")) return null;
                      const mealDesc = specialBurgerMenuDescription(
                        locale,
                        pid,
                        item.specialPattyGrams
                      );
                      if (!mealDesc) return null;
                      return (
                        <p className="text-[11px] text-gray-400">
                          {t("checkout.specialMealComponentsPrefix")}: {mealDesc}
                        </p>
                      );
                    })()}
                    {typeof item.bunSauceOnBun === "boolean" ? (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.bunSauceOnBunPrefix")}:{" "}
                        {item.bunSauceOnBun
                          ? t("ui.bunSauceYes")
                          : t("ui.bunSauceNo")}
                      </p>
                    ) : null}
                    {item.burgerDoneness?.label ? (
                      <p className="text-[11px] text-gray-400">
                        {t("checkout.donenessPrefix")}:{" "}
                        {item.burgerDoneness.label}
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
                    {item.mealFriesLabel ? (
                      <p className="text-[11px] text-emerald-200/90">
                        {t("checkout.mealFriesPrefix")}: {item.mealFriesLabel}
                        {Number.isFinite(Number(item.mealFriesPrice))
                          ? ` (+₪${formatIls(Number(item.mealFriesPrice))})`
                          : ""}
                      </p>
                    ) : null}
                    {item.requestedDrinkLabel ? (
                      <p className="text-[11px] text-sky-200/90">
                        {t("wa.drink")}: {item.requestedDrinkLabel}
                        {Number.isFinite(Number(item.requestedDrinkPrice))
                          ? ` (+₪${formatIls(Number(item.requestedDrinkPrice))})`
                          : ""}
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
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCartPattyError("");
                          updateQuantity(item.id, item.quantity - 1);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 text-xs"
                      >
                        −
                      </button>
                      <span className="min-w-[1.25rem] text-center text-sm">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void tryBumpCheckoutQuantity(
                            item,
                            item.quantity + 1
                          )
                        }
                        disabled={lineOos}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-sm font-semibold" dir="ltr">
                      ₪{formatIls(lineTotal(item))}
                    </p>
                  </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-4 border-t border-slate-800/70 pt-2">
                    {isEditableMealCartLine(item, menuItems) ? (
                      <button
                        type="button"
                        onClick={() => {
                          const cat = mealCatalogItemForCartLine(
                            item,
                            menuItems
                          );
                          if (cat) openMealEditLine(cat, item);
                        }}
                        className="text-[11px] font-semibold text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
                      >
                        {t("cart.editMeal")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-[11px] font-semibold leading-none text-red-400 hover:text-red-300"
                    >
                      {t("checkout.remove")}
                    </button>
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
            {discountAmountNis > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-300/90">
                  {t("checkout.discountLine")} (
                  {Number(discountCfg.percent).toFixed(2).replace(/\.00$/, "")}%)
                </span>
                <span className="text-sm font-semibold text-emerald-300/90">
                  -₪{formatIls(discountAmountNis)}
                </span>
              </div>
            ) : null}
            {couponDiscountNis > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-cyan-300/90">
                  {t("checkout.couponLine")}
                  {appliedCoupon?.code ? ` (${appliedCoupon.code})` : ""}
                </span>
                <span className="text-sm font-semibold text-cyan-300/90">
                  -₪{formatIls(couponDiscountNis)}
                </span>
              </div>
            ) : null}
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
              {t("checkout.firstName")}
            </label>
            <input
              type="text"
              name="firstName"
              value={form.firstName}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs outline-none focus:border-primary"
              placeholder={t("checkout.firstNamePh")}
              autoComplete="given-name"
            />
            {errors.firstName && (
              <p className="mt-1 text-[11px] text-red-400">
                {errors.firstName}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-gray-300">
              {t("checkout.lastName")}
            </label>
            <input
              type="text"
              name="lastName"
              value={form.lastName}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs outline-none focus:border-primary"
              placeholder={t("checkout.lastNamePh")}
              autoComplete="family-name"
            />
            {errors.lastName && (
              <p className="mt-1 text-[11px] text-red-400">
                {errors.lastName}
              </p>
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
            {form.firstName.trim() &&
            form.lastName.trim() &&
            form.phone.trim() ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-gray-400">
                  {t("checkout.saveContactQuestion")}
                </span>
                <div className="flex gap-1" role="group" aria-label={t("checkout.saveContactQuestion")}>
                  <button
                    type="button"
                    onClick={() => setSaveContactChoice(true)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                      saveContactChoice
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-slate-600 text-gray-400 hover:border-slate-500"
                    }`}
                  >
                    {t("checkout.saveContactYes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveContactChoice(false)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                      !saveContactChoice
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-slate-600 text-gray-400 hover:border-slate-500"
                    }`}
                  >
                    {t("checkout.saveContactNo")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-gray-300">
              {t("checkout.orderType")}
            </label>
            <div className="flex gap-2">
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
          <h3 className="mb-2 text-sm font-semibold">{t("checkout.couponTitle")}</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponCodeInput}
              onChange={(e) => {
                setCouponCodeInput(e.target.value.toUpperCase());
                if (appliedCoupon) setAppliedCoupon(null);
                if (couponMsg) setCouponMsg("");
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs uppercase outline-none focus:border-primary"
              placeholder={t("checkout.couponPh")}
            />
            <button
              type="button"
              onClick={applyCoupon}
              disabled={couponBusy}
              className="rounded-full border border-primary/60 px-3 py-2 text-[11px] font-semibold text-primary disabled:opacity-50"
            >
              {couponBusy ? t("checkout.couponChecking") : t("checkout.couponApply")}
            </button>
          </div>
          {couponMsg ? (
            <p
              className={`mt-1 text-[11px] ${
                appliedCoupon ? "text-emerald-300/90" : "text-red-400"
              }`}
            >
              {couponMsg}
            </p>
          ) : null}
        </div>

        <div className="mt-2 border-t border-slate-800 pt-3">
          <h3 className="mb-2 text-sm font-semibold">{t("checkout.payment")}</h3>
          <div className="grid grid-cols-3 gap-2 items-end">
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
                      ₪{formatIls(Math.max(0, discountedFoodTotal - couponDiscountNis))}
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

        {form.payment === "card" ? (
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-gray-400">
              {t("checkout.emailOptional")}
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={form.email}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs outline-none focus:border-primary"
                placeholder={t("checkout.emailPlaceholder")}
              />
            </label>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || !items.length || !orderingAllowed}
          className="btn-primary flex w-full items-center justify-center gap-2 text-sm"
        >
          {isSubmitting ? t("checkout.submitting") : t("checkout.submit")}
        </button>
      </form>

      {!orderingAllowed && items.length > 0 ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 px-6 py-10 backdrop-blur-sm"
          role="alert"
          aria-live="polite"
        >
          <div className="max-w-sm space-y-3 text-center">
            <p className="text-lg font-semibold leading-snug text-amber-50 sm:text-xl">
              {t("checkout.restaurantClosedNow")}
            </p>
            {todayScheduledOpen ? (
              <p className="text-lg font-semibold leading-snug text-amber-50 sm:text-xl">
                {t("home.restaurantOpensAt16")}
              </p>
            ) : null}
            <p className="text-sm font-medium leading-snug text-amber-200/90">
              {t("checkout.restaurantClosedHoursHint")}
            </p>
          </div>
        </div>
      ) : null}
      </div>

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
