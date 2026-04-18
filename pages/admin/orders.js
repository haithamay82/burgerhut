import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { upload as uploadToBlob } from "@vercel/blob/client";
import { useLocale } from "@/contexts/LocaleContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  BURGER_TOPPINGS,
  CRISPY_MEAL_SALADS,
  INVENTORY_MANAGED_SALAD_IDS,
  MENU_ITEMS,
} from "@/utils/menuData";

const INVENTORY_MANAGED_SALADS = CRISPY_MEAL_SALADS.filter((r) =>
  INVENTORY_MANAGED_SALAD_IDS.has(r.id)
);
import {
  emptyCatalogEditor,
  mergeMenuItemsFromEditor,
} from "@/utils/mergeMenuCatalog";
import { menuItemName } from "@/utils/menuItemLabels";
import { getDefaultBusinessSchedule } from "@/utils/businessHoursDefaults";
import {
  aggregatePattyCountsFromOrderItems,
  computeAutoUnavailableBurgerIds,
  hasAnyPattyPrep,
  PATTY_GRAMS_ORDER,
} from "@/utils/burgerPattyPrep";
import {
  readPersistedAdminSecret,
  writePersistedAdminSecret,
  resolveAdminSecret,
  ADMIN_PROMO_PANEL_SESSION_KEY,
  ADMIN_SLIDER_PANEL_SESSION_KEY,
} from "@/utils/adminSecretPersist";
import {
  prepareSliderImageForUpload,
  blobToBase64PngOrJpeg,
} from "@/utils/prepareSliderImageForUpload";
import { sortSaladsForDisplay } from "@/utils/saladDisplayOrder";
import { cartLineProductId } from "@/hooks/useCart";
import { formatIls } from "@/utils/cartMoney";
import { specialBurgerMenuDescription } from "@/utils/specialBurgerMealDescription";
import {
  buildOrderItemsHeadlinesPlain,
  getCartItemsInWhatsAppOrder,
} from "@/utils/whatsapp";
import {
  getAdminLocalPushSubscribed,
  subscribeAdminWebPush,
  unsubscribeAdminWebPush,
} from "@/utils/adminPushClient";
import html2canvas from "html2canvas";
import AdminMenuExportSheet from "@/components/AdminMenuExportSheet";

const INVENTORY_CATEGORIES = ["burgers", "specials", "crispy"];
const CATALOG_CATEGORIES = ["burgers", "specials", "crispy", "sides", "drinks"];
const CATALOG_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** ריענון הזמנות בדף ניהול — לזיהוי הזמנות חדשות */
const ADMIN_ORDERS_POLL_MS = 15000;

function syncAdminOrdersKnownIdsRef(idsRef, ordersList) {
  idsRef.current = new Set(
    (ordersList || [])
      .map((o) => String(o?.id || ""))
      .filter(Boolean)
  );
}

function playAdminNewOrderBeep() {
  if (typeof window === "undefined") return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const run = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.23);
    };
    if (ctx.state === "suspended") {
      void ctx.resume().then(run).catch(() => {});
    } else {
      run();
    }
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 400);
  } catch {
    /* ignore */
  }
}

function vibrateAdminNewOrder() {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([90, 60, 90]);
    }
  } catch {
    /* ignore */
  }
}

/** התאמה ל־Web Push: מס׳ הזמנה, קופון, ורשימת פריטים 1,2,… כמו בווטסאפ */
function buildAdminDesktopNewOrderBody(t, order, locale = "he") {
  const n = String(order?.orderNumber ?? "").trim();
  let body = n
    ? t("admin.newOrderNotifyBodyOne").replace("{n}", n)
    : t("admin.newOrderNotifyBodyNoNum");
  const disc = Number(order?.customer?.couponDiscountNis);
  const code = String(order?.customer?.couponCode || "").trim().toUpperCase();
  if (Number.isFinite(disc) && disc > 0) {
    body += t("admin.newOrderNotifyCouponDiscount").replace(
      "{amount}",
      formatIls(disc)
    );
  }
  if (code) {
    body += t("admin.newOrderNotifyCouponCode").replace("{code}", code);
  }
  const items = order?.items;
  if (Array.isArray(items) && items.length) {
    const loc = locale === "ar" ? "ar" : "he";
    body += `\n\n${buildOrderItemsHeadlinesPlain(items, loc)}`;
  }
  return body;
}

/** timeout ל-fetch של הגדרות סליידר */
function sliderAdminFetchSignal() {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return AbortSignal.timeout(90000);
  }
  return undefined;
}

function formatTime(iso, locale) {
  const loc = locale === "ar" ? "ar" : "he-IL";
  return new Date(iso).toLocaleString(loc, {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCouponDateTime(ts, locale) {
  if (!Number.isFinite(Number(ts)) || Number(ts) <= 0) return "—";
  const loc = locale === "ar" ? "ar" : "he-IL";
  return new Date(Number(ts)).toLocaleString(loc, {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** כמו הרובלקה בכרטיס: פג תוקף → נוצל → לא נוצל */
function couponDisplayStatus(c, nowTs) {
  const expired =
    Number.isFinite(Number(c.expiresAt)) &&
    Number(c.expiresAt) > 0 &&
    Number(c.expiresAt) < nowTs;
  if (expired) return "expired";
  if (Boolean(c.used)) return "used";
  return "unused";
}

/** מספר הזמנה שעליו חושב הקופון — לתצוגת מנהל בלבד */
function couponRewardSourceOrderDisplay(c) {
  const explicit = String(c.sourceOrderNumber || "").trim();
  if (explicit) return explicit;
  const oid = String(c.orderId || "").trim();
  if (/^\d+$/.test(oid)) return oid;
  return "";
}

function couponRedemptionOrderDisplay(c) {
  return String(c.usedByOrderNumber ?? "").trim();
}

function orderDeliveryFeeNis(o) {
  if (o?.customer?.orderType !== "delivery") return 0;
  const fee = Number(o.customer.deliveryFeeNis);
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
}

/** מכירות מזון בלבד (ללא דמי משלוח) — לפי total השמור פחות דמי משלוח כשמוגדרים */
function orderFoodSalesNis(o) {
  const total = Number(o.total) || 0;
  return Math.max(0, total - orderDeliveryFeeNis(o));
}

function dayFoodSalesTotal(dayOrders) {
  return dayOrders.reduce((sum, o) => sum + orderFoodSalesNis(o), 0);
}

function dayDeliveryFeesTotal(dayOrders) {
  return dayOrders.reduce((sum, o) => sum + orderDeliveryFeeNis(o), 0);
}

function payCourierDeliverySplitLabel(t, payment) {
  const mid =
    payment === "bit" || payment === "card"
      ? t(`payment.${payment}`)
      : t("payment.card");
  return `${t("checkout.payCourierDeliveryFoodPrefix")}${mid}${t("checkout.payCourierDeliveryFoodSuffix")}`;
}

function formatDayHeading(dayStr, locale) {
  const parts = dayStr.split("-").map((x) => parseInt(x, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d) return dayStr;
  const loc = locale === "ar" ? "ar" : "he-IL";
  return new Date(y, m - 1, d).toLocaleDateString(loc, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** מפתח YYYY-MM-DD לפי יום בירושלים (כמו קיבוץ ההזמנות) */
function jerusalemDayKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

function parseDayKey(key) {
  const [ys, ms, ds] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  return { y, m, d };
}

function dayKeyFromParts(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** מספר ימים בחודש גרגוריאני (y, m בשביל 1–12) */
function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0 = ראשון … 6 = שבת — לפי תאריך אזרחי אחיד */
function weekdaySun0(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function weekdayShortLabels(locale) {
  const loc = locale === "ar" ? "ar" : "he-IL";
  const fmt = new Intl.DateTimeFormat(loc, { weekday: "short" });
  const labels = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(Date.UTC(2024, 0, 7 + i, 12, 0, 0));
    labels.push(fmt.format(d));
  }
  return labels;
}

function formatMonthYearTitle(y, m, locale) {
  const loc = locale === "ar" ? "ar" : "he-IL";
  return new Date(Date.UTC(y, m - 1, 1, 12, 0, 0)).toLocaleDateString(loc, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function AdminOrdersPage() {
  const { locale, t } = useLocale();
  const [secret, setSecret] = useState("");
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [manualUnavailableIds, setManualUnavailableIds] = useState([]);
  /** מלאי קציצות לפי גרם — null = מעקב כבוי */
  const [pattyStock, setPattyStock] = useState(null);
  const [pattyDraft, setPattyDraft] = useState(() =>
    Object.fromEntries(PATTY_GRAMS_ORDER.map((g) => [g, ""]))
  );

  const inventoryAutoBlockedIds = useMemo(
    () =>
      pattyStock ? computeAutoUnavailableBurgerIds(pattyStock) : [],
    [pattyStock]
  );

  const inventoryEffectiveUnavailableSet = useMemo(() => {
    const s = new Set(manualUnavailableIds);
    for (const id of inventoryAutoBlockedIds) s.add(id);
    return s;
  }, [manualUnavailableIds, inventoryAutoBlockedIds]);

  useEffect(() => {
    if (pattyStock) {
      setPattyDraft(
        Object.fromEntries(
          PATTY_GRAMS_ORDER.map((g) => [g, String(pattyStock[g] ?? "")])
        )
      );
    } else {
      setPattyDraft(
        Object.fromEntries(PATTY_GRAMS_ORDER.map((g) => [g, ""]))
      );
    }
  }, [pattyStock]);
  const [invSaving, setInvSaving] = useState(false);
  const [hoursDraft, setHoursDraft] = useState(null);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursMsg, setHoursMsg] = useState("");
  const [discountDraft, setDiscountDraft] = useState(null);
  const [discountSaving, setDiscountSaving] = useState(false);
  const [discountMsg, setDiscountMsg] = useState("");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogEditor, setCatalogEditor] = useState(() => emptyCatalogEditor());
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogMsg, setCatalogMsg] = useState("");
  const [menuExportBusy, setMenuExportBusy] = useState(false);
  const [menuExportErr, setMenuExportErr] = useState("");
  const [catalogModal, setCatalogModal] = useState(null);
  const [catalogImageUploading, setCatalogImageUploading] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  /** סליידר מחוץ לפאנל הפרסום — מונע סגירה/באגים בנייד אחרי בורר קבצים */
  const [sliderPanelOpen, setSliderPanelOpen] = useState(false);
  const [hoursPanelOpen, setHoursPanelOpen] = useState(false);
  const [discountPanelOpen, setDiscountPanelOpen] = useState(false);
  const [promo, setPromo] = useState(null);
  const [promoUploading, setPromoUploading] = useState(false);
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoMsg, setPromoMsg] = useState("");
  const [coupons, setCoupons] = useState([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponDeleteCode, setCouponDeleteCode] = useState("");
  const [couponMsg, setCouponMsg] = useState("");
  const [couponPanelOpen, setCouponPanelOpen] = useState(false);
  const [siteVisitsPanelOpen, setSiteVisitsPanelOpen] = useState(false);
  /** סינון רשימת קופונים: null = הכל */
  const [couponStatusFilter, setCouponStatusFilter] = useState(null);

  const couponValueTotals = useMemo(() => {
    const nowTs = Date.now();
    let unused = 0;
    let used = 0;
    for (const c of coupons) {
      const v = Number(c.value) || 0;
      if (Boolean(c.used)) {
        used += v;
      } else if (couponDisplayStatus(c, nowTs) === "unused") {
        unused += v;
      }
    }
    return { unused, used };
  }, [coupons]);

  /** ביקורים יומיים לאתר / PWA */
  const [siteVisitsDays, setSiteVisitsDays] = useState([]);
  const [siteVisitsErr, setSiteVisitsErr] = useState("");
  /** מונה התקנות PWA מצטבר (Redis); null = לא נטען או שגיאה */
  const [pwaInstallTotal, setPwaInstallTotal] = useState(null);
  const promoFileRef = useRef(null);
  const sliderFileRef = useRef(null);
  const catalogImageFileRef = useRef(null);
  const menuExportRef = useRef(null);
  const adminSessionHydratedRef = useRef(false);
  /** מזהי הזמנות אחרי טעינה/פולינג — לזיהוי שורות חדשות */
  const ordersKnownIdsRef = useRef(new Set());
  const [notifyPermissionNonce, setNotifyPermissionNonce] = useState(0);
  /** null = לא רלוונטי או בודקים, true/false = יש מנוי מקומי ב-SW */
  const [adminLocalPushSubscribed, setAdminLocalPushSubscribed] =
    useState(null);
  const [adminPushMsg, setAdminPushMsg] = useState("");
  /** סטטוס שרת Push (אחרי טעינת פאנל) — VAPID, Redis, מספר מנויים */
  const [adminPushServerStatus, setAdminPushServerStatus] = useState(null);
  const [adminPushClearBusy, setAdminPushClearBusy] = useState(false);
  const [adminPushClearMsg, setAdminPushClearMsg] = useState("");
  const [adminClientReady, setAdminClientReady] = useState(false);
  const [sliderImages, setSliderImages] = useState([]);
  const [sliderDisplayEnabled, setSliderDisplayEnabled] = useState(true);
  const [sliderMsg, setSliderMsg] = useState("");
  const [sliderUploading, setSliderUploading] = useState(false);

  const [selectedDayKey, setSelectedDayKey] = useState(null);
  const [calView, setCalView] = useState({ y: 2026, m: 1 });

  const ordersByDay = useMemo(() => {
    const map = new Map();
    for (const o of orders) {
      const d = new Date(o.createdAt);
      const key = d.toLocaleDateString("en-CA", {
        timeZone: "Asia/Jerusalem",
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return map;
  }, [orders]);

  /** סה״כ מכירות מזון ודמי משלוח לחודש הנצפה בלוח (Asia/Jerusalem) */
  const calendarMonthSalesTotals = useMemo(() => {
    const { y: yy, m: mm } = calView;
    const dim = daysInMonth(yy, mm);
    let food = 0;
    let delivery = 0;
    for (let d = 1; d <= dim; d += 1) {
      const key = dayKeyFromParts(yy, mm, d);
      const arr = ordersByDay.get(key);
      if (!arr?.length) continue;
      food += dayFoodSalesTotal(arr);
      delivery += dayDeliveryFeesTotal(arr);
    }
    return { food, delivery };
  }, [ordersByDay, calView]);

  const weekdayLabels = useMemo(
    () => weekdayShortLabels(locale),
    [locale]
  );

  const mergedCatalogItems = useMemo(
    () => mergeMenuItemsFromEditor(catalogEditor),
    [catalogEditor]
  );

  const mergedMainForInventory = useMemo(
    () =>
      mergedCatalogItems.filter(
        (row) =>
          row.category === "burgers" ||
          row.category === "specials" ||
          row.category === "crispy"
      ),
    [mergedCatalogItems]
  );

  const persistCatalog = async (nextEditor) => {
    if (!secret.trim()) return;
    setCatalogMsg("");
    setError("");
    setCatalogSaving(true);
    try {
      const r = await fetch("/api/catalog", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret.trim(),
        },
        body: JSON.stringify(nextEditor),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setCatalogMsg(t("admin.catalogErr"));
        return;
      }
      if (d.editor) setCatalogEditor(d.editor);
      setCatalogMsg(t("admin.catalogSaved"));
    } catch {
      setCatalogMsg(t("admin.catalogErr"));
    } finally {
      setCatalogSaving(false);
    }
  };

  const removeCatalogItem = (row) => {
    if (!secret.trim()) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("admin.catalogRemoveConfirm"))
    ) {
      return;
    }
    const isCustom = catalogEditor.customItems.some((c) => c.id === row.id);
    const isBase = MENU_ITEMS.some((m) => m.id === row.id);
    if (isCustom) {
      persistCatalog({
        ...catalogEditor,
        customItems: catalogEditor.customItems.filter((c) => c.id !== row.id),
      });
      return;
    }
    if (isBase) {
      const nextHidden = [...new Set([...catalogEditor.hiddenIds, row.id])];
      const nextOverrides = { ...catalogEditor.overrides };
      delete nextOverrides[row.id];
      persistCatalog({
        ...catalogEditor,
        hiddenIds: nextHidden,
        overrides: nextOverrides,
      });
    }
  };

  const restoreHiddenCatalogItem = (id) => {
    if (!secret.trim()) return;
    persistCatalog({
      ...catalogEditor,
      hiddenIds: catalogEditor.hiddenIds.filter((x) => x !== id),
    });
  };

  const openCatalogAdd = (category) => {
    setCatalogModal({
      kind: "add",
      draft: {
        id: "",
        category,
        basePrice: "0",
        image: "",
        nameHe: "",
        nameAr: "",
        descHe: "",
        descAr: "",
      },
    });
  };

  const openCatalogEdit = (row) => {
    const isCustom = catalogEditor.customItems.some((c) => c.id === row.id);
    setCatalogModal({
      kind: "edit",
      isCustom,
      draft: {
        id: row.id,
        category: row.category,
        basePrice: String(row.basePrice ?? ""),
        image: row.image || "",
        nameHe: row.nameHe || "",
        nameAr: row.nameAr || "",
        descHe: row.descHe || "",
        descAr: row.descAr || "",
      },
    });
  };

  const submitCatalogModal = () => {
    if (!catalogModal || !secret.trim() || catalogImageUploading) return;
    const d = catalogModal.draft;
    if (catalogModal.kind === "add") {
      const id = String(d.id || "")
        .trim()
        .toLowerCase();
      if (!CATALOG_ID_RE.test(id)) {
        setCatalogMsg(t("admin.catalogErrId"));
        return;
      }
      if (
        MENU_ITEMS.some((m) => m.id === id) ||
        catalogEditor.customItems.some((c) => c.id === id)
      ) {
        setCatalogMsg(t("admin.catalogErrId"));
        return;
      }
      if (!String(d.nameHe || "").trim() || !String(d.nameAr || "").trim()) {
        setCatalogMsg(t("admin.catalogErrNames"));
        return;
      }
      if (!String(d.image || "").trim()) {
        setCatalogMsg(t("admin.catalogImageRequired"));
        return;
      }
      const bp = Number(d.basePrice);
      if (!Number.isFinite(bp) || bp < 0) {
        setCatalogMsg(t("admin.catalogErr"));
        return;
      }
      const row = {
        id,
        category: d.category,
        basePrice: bp,
        image: String(d.image).trim(),
        nameHe: String(d.nameHe).trim(),
        nameAr: String(d.nameAr).trim(),
      };
      const dh = String(d.descHe || "").trim();
      const da = String(d.descAr || "").trim();
      if (dh) row.descHe = dh;
      if (da) row.descAr = da;
      persistCatalog({
        ...catalogEditor,
        customItems: [...catalogEditor.customItems, row],
      });
      setCatalogModal(null);
      return;
    }
    const baseRow = MENU_ITEMS.find((m) => m.id === d.id);
    if (catalogModal.isCustom) {
      if (!String(d.nameHe || "").trim() || !String(d.nameAr || "").trim()) {
        setCatalogMsg(t("admin.catalogErrNames"));
        return;
      }
      if (!String(d.image || "").trim()) {
        setCatalogMsg(t("admin.catalogImageRequired"));
        return;
      }
      const bp = Number(d.basePrice);
      if (!Number.isFinite(bp) || bp < 0) {
        setCatalogMsg(t("admin.catalogErr"));
        return;
      }
      const row = {
        id: d.id,
        category: d.category,
        basePrice: bp,
        image: String(d.image).trim(),
        nameHe: String(d.nameHe).trim(),
        nameAr: String(d.nameAr).trim(),
      };
      const dh = String(d.descHe || "").trim();
      const da = String(d.descAr || "").trim();
      if (dh) row.descHe = dh;
      if (da) row.descAr = da;
      persistCatalog({
        ...catalogEditor,
        customItems: catalogEditor.customItems.map((c) =>
          c.id === d.id ? row : c
        ),
      });
      setCatalogModal(null);
      return;
    }
    if (!baseRow) {
      setCatalogModal(null);
      return;
    }
    const bp = Number(d.basePrice);
    if (!Number.isFinite(bp) || bp < 0) {
      setCatalogMsg(t("admin.catalogErr"));
      return;
    }
    const patch = {
      basePrice: bp,
      category: d.category,
      image: String(d.image || "").trim() || baseRow.image,
    };
    const nh = String(d.nameHe || "").trim();
    const na = String(d.nameAr || "").trim();
    const dh = String(d.descHe || "").trim();
    const da = String(d.descAr || "").trim();
    if (nh) patch.nameHe = nh;
    if (na) patch.nameAr = na;
    if (dh) patch.descHe = dh;
    if (da) patch.descAr = da;
    persistCatalog({
      ...catalogEditor,
      overrides: { ...catalogEditor.overrides, [d.id]: patch },
    });
    setCatalogModal(null);
  };

  const load = async (e, secretOverride) => {
    e?.preventDefault();
    const effectiveSecret = String(secretOverride ?? secret).trim();
    if (!effectiveSecret) return;
    setError("");
    setAdminPushMsg("");
    setLoading(true);
    try {
      const r = await fetch("/api/orders", {
        headers: { "x-admin-secret": effectiveSecret },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        writePersistedAdminSecret("");
        setOrders([]);
        setLoaded(false);
        setHoursDraft(null);
        setDiscountDraft(null);
        setPromo(null);
        setCoupons([]);
        setSiteVisitsDays([]);
        setSiteVisitsErr("");
        setPwaInstallTotal(null);
        setCatalogEditor(emptyCatalogEditor());
        setError(
          data.error === "admin_not_configured"
            ? t("admin.errConfig")
            : t("admin.errAuth")
        );
        return;
      }
      setSecret(effectiveSecret);
      writePersistedAdminSecret(effectiveSecret);
      const nextOrders = data.orders || [];
      setOrders(nextOrders);
      syncAdminOrdersKnownIdsRef(ordersKnownIdsRef, nextOrders);
      setLoaded(true);
      setHoursMsg("");
      setDiscountMsg("");
      setCouponMsg("");
      const todayK = jerusalemDayKey();
      const { y: ty, m: tm } = parseDayKey(todayK);
      setSelectedDayKey(todayK);
      setCalView({ y: ty, m: tm });
      try {
        const invR = await fetch("/api/inventory", {
          headers: { "x-admin-secret": effectiveSecret },
        });
        const invData = await invR.json().catch(() => ({}));
        if (invR.ok && invData.ok) {
          if (Array.isArray(invData.manualUnavailableIds)) {
            setManualUnavailableIds(invData.manualUnavailableIds);
          } else {
            setManualUnavailableIds([]);
          }
          setPattyStock(
            invData.pattyStock && typeof invData.pattyStock === "object"
              ? invData.pattyStock
              : null
          );
        } else {
          setManualUnavailableIds([]);
          setPattyStock(null);
        }
      } catch {
        setManualUnavailableIds([]);
        setPattyStock(null);
      }
      try {
        const catR = await fetch("/api/catalog", {
          headers: { "x-admin-secret": effectiveSecret },
        });
        const catD = await catR.json().catch(() => ({}));
        if (catR.ok && catD.editor && typeof catD.editor === "object") {
          setCatalogEditor({
            hiddenIds: Array.isArray(catD.editor.hiddenIds)
              ? [...catD.editor.hiddenIds]
              : [],
            customItems: Array.isArray(catD.editor.customItems)
              ? catD.editor.customItems.map((x) => ({ ...x }))
              : [],
            overrides:
              catD.editor.overrides && typeof catD.editor.overrides === "object"
                ? { ...catD.editor.overrides }
                : {},
          });
        } else if (catR.status === 401) {
          setCatalogMsg(t("admin.errAuth"));
        } else if (catR.ok) {
          setCatalogEditor(emptyCatalogEditor());
        }
      } catch {
        setCatalogEditor(emptyCatalogEditor());
      }
      try {
        const bhR = await fetch("/api/business-hours");
        const bhData = await bhR.json().catch(() => ({}));
        if (bhR.ok && Array.isArray(bhData.days)) {
          setHoursDraft(bhData.days.map((d) => ({ ...d })));
        } else {
          setHoursDraft(getDefaultBusinessSchedule());
        }
      } catch {
        setHoursDraft(getDefaultBusinessSchedule());
      }
      try {
        const dr = await fetch("/api/discount");
        const dd = await dr.json().catch(() => ({}));
        if (dr.ok && dd.ok) {
          setDiscountDraft({
            enabled: Boolean(dd.enabled),
            percent: Number(dd.percent) || 0,
            minOrderTotal: Number(dd.minOrderTotal) || 0,
            reason: String(dd.reason ?? ""),
            couponEnabled: Boolean(dd.couponEnabled),
            couponPercent: Number(dd.couponPercent) || 0,
          });
        } else {
          setDiscountDraft({
            enabled: false,
            percent: 0,
            minOrderTotal: 0,
            reason: "",
            couponEnabled: false,
            couponPercent: 0,
          });
        }
      } catch {
        setDiscountDraft({
          enabled: false,
          percent: 0,
          minOrderTotal: 0,
          reason: "",
          couponEnabled: false,
          couponPercent: 0,
        });
      }
      try {
        const pr = await fetch("/api/promo");
        const pd = await pr.json().catch(() => ({}));
        if (pr.ok && pd.ok) {
          setPromo(pd);
        } else {
          setPromo(null);
        }
      } catch {
        setPromo(null);
      }
      try {
        setCouponsLoading(true);
        const cr = await fetch("/api/coupons", {
          headers: { "x-admin-secret": effectiveSecret },
        });
        const cd = await cr.json().catch(() => ({}));
        if (cr.ok && cd?.ok && Array.isArray(cd.coupons)) {
          setCoupons(cd.coupons);
        } else {
          setCoupons([]);
        }
      } catch {
        setCoupons([]);
      } finally {
        setCouponsLoading(false);
      }
      setSiteVisitsErr("");
      setSiteVisitsDays([]);
      try {
        const vr = await fetch("/api/site-visits?days=31", {
          headers: { "x-admin-secret": effectiveSecret },
        });
        const vd = await vr.json().catch(() => ({}));
        if (vr.ok && vd?.ok && Array.isArray(vd.days)) {
          setSiteVisitsDays(vd.days);
        } else if (vd?.error === "redis_not_configured") {
          setSiteVisitsErr("redis");
        } else if (!vr.ok) {
          setSiteVisitsErr("load");
        }
      } catch {
        setSiteVisitsErr("load");
      }
      try {
        const pir = await fetch("/api/pwa-installs", {
          headers: { "x-admin-secret": effectiveSecret },
        });
        const pid = await pir.json().catch(() => ({}));
        if (pir.ok && pid?.ok && Number.isFinite(Number(pid.total))) {
          setPwaInstallTotal(Number(pid.total));
        } else {
          setPwaInstallTotal(null);
        }
      } catch {
        setPwaInstallTotal(null);
      }
    } catch {
      setError(t("admin.errNet"));
      setLoaded(false);
      setHoursDraft(null);
      setDiscountDraft(null);
      setPromo(null);
      setCoupons([]);
      setSiteVisitsDays([]);
      setSiteVisitsErr("");
      setPwaInstallTotal(null);
      setCatalogEditor(emptyCatalogEditor());
    } finally {
      setLoading(false);
    }
  };

  const logoutAdmin = () => {
    if (typeof window !== "undefined") {
      const s = secret.trim();
      if (s) void unsubscribeAdminWebPush(s);
      try {
        window.sessionStorage.removeItem(ADMIN_PROMO_PANEL_SESSION_KEY);
        window.sessionStorage.removeItem(ADMIN_SLIDER_PANEL_SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
    writePersistedAdminSecret("");
    adminSessionHydratedRef.current = false;
    ordersKnownIdsRef.current = new Set();
    setSecret("");
    setError("");
    setOrders([]);
    setLoaded(false);
    setHoursDraft(null);
    setDiscountDraft(null);
    setPromo(null);
    setCoupons([]);
    setSiteVisitsDays([]);
    setSiteVisitsErr("");
    setPwaInstallTotal(null);
    setCatalogEditor(emptyCatalogEditor());
    setSliderImages([]);
    setSliderMsg("");
    setManualUnavailableIds([]);
    setPattyStock(null);
    setPromoOpen(false);
    setSliderPanelOpen(false);
    setCatalogOpen(false);
    setInventoryOpen(false);
    setHoursPanelOpen(false);
    setDiscountPanelOpen(false);
    setCouponPanelOpen(false);
    setSiteVisitsPanelOpen(false);
    setCatalogModal(null);
    setAdminPushServerStatus(null);
    setAdminPushClearMsg("");
    setAdminLocalPushSubscribed(null);
  };

  const refreshAdminPushServerStatus = useCallback(async () => {
    const s = secret.trim();
    if (!s) {
      setAdminPushServerStatus(null);
      return;
    }
    try {
      const r = await fetch(`/api/admin/push/status?_=${Date.now()}`, {
        headers: { "x-admin-secret": s },
        cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        setAdminPushServerStatus({
          vapidConfigured: Boolean(d.vapidConfigured),
          redisConfigured: Boolean(d.redisConfigured),
          subscriptionCount: Number(d.subscriptionCount) || 0,
        });
      } else {
        setAdminPushServerStatus(null);
      }
    } catch {
      setAdminPushServerStatus(null);
    }
  }, [secret]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (adminSessionHydratedRef.current) return;
    const stored = readPersistedAdminSecret();
    if (!stored) return;
    adminSessionHydratedRef.current = true;
    setSecret(stored);
    void load(undefined, stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- פעם אחת אחרי ריענון (מובייל / בורר קבצים)
  }, []);

  useEffect(() => {
    setAdminClientReady(true);
  }, []);

  useEffect(() => {
    if (!loaded || typeof window === "undefined") {
      if (!loaded) setAdminLocalPushSubscribed(null);
      return;
    }
    if (
      !adminClientReady ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      setAdminLocalPushSubscribed(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const ok = await getAdminLocalPushSubscribed();
      if (!cancelled) setAdminLocalPushSubscribed(ok);
    };
    void run();
    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loaded, adminClientReady, notifyPermissionNonce]);

  useEffect(() => {
    if (!loaded) {
      setAdminPushServerStatus(null);
      return;
    }
    void refreshAdminPushServerStatus();
  }, [loaded, refreshAdminPushServerStatus]);

  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    try {
      const p = window.sessionStorage.getItem(ADMIN_PROMO_PANEL_SESSION_KEY);
      const s = window.sessionStorage.getItem(ADMIN_SLIDER_PANEL_SESSION_KEY);
      if (p === "1") setPromoOpen(true);
      else if (p === "0") setPromoOpen(false);
      if (s === "1") setSliderPanelOpen(true);
      else if (s === "0") setSliderPanelOpen(false);
    } catch {
      /* ignore */
    }
  }, [loaded]);

  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    const s = secret.trim();
    if (!s) return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/orders?_=${Date.now()}`, {
          headers: { "x-admin-secret": s },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.ok) return;
        const list = Array.isArray(data.orders) ? data.orders : [];
        const known = ordersKnownIdsRef.current;
        const newRows = list.filter((o) => o?.id && !known.has(String(o.id)));
        if (newRows.length > 0) {
          playAdminNewOrderBeep();
          vibrateAdminNewOrder();
          const title = t("admin.newOrderNotifyTitle");
          const body =
            newRows.length === 1
              ? buildAdminDesktopNewOrderBody(t, newRows[0], locale)
              : t("admin.newOrderNotifyBodyMany").replace(
                  "{c}",
                  String(newRows.length)
                );
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            try {
              new Notification(title, {
                body,
                icon: "/logo-burger-hut.png",
                tag: `bh-ord-${Date.now()}`,
              });
            } catch {
              /* ignore */
            }
          }
        }
        syncAdminOrdersKnownIdsRef(ordersKnownIdsRef, list);
        setOrders(list);
      } catch {
        /* ignore */
      }
    };

    const id = window.setInterval(poll, ADMIN_ORDERS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loaded, secret, t, locale]);

  const deleteCoupon = async (code) => {
    if (!secret.trim() || !code) return;
    if (typeof window !== "undefined" && !window.confirm(t("admin.couponDeleteConfirm"))) {
      return;
    }
    setError("");
    setCouponMsg("");
    setCouponDeleteCode(code);
    try {
      const r = await fetch(`/api/coupons?code=${encodeURIComponent(code)}`, {
        method: "DELETE",
        headers: { "x-admin-secret": secret.trim() },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(
          d.error === "admin_not_configured"
            ? t("admin.errConfig")
            : t("admin.couponDeleteErr")
        );
        return;
      }
      setCoupons((prev) => prev.filter((c) => c.code !== code));
      setCouponMsg(t("admin.couponDeleted"));
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setCouponDeleteCode("");
    }
  };

  const deleteOrder = async (orderId) => {
    if (!secret.trim()) return;
    if (typeof window !== "undefined" && !window.confirm(t("admin.deleteConfirm"))) {
      return;
    }
    setError("");
    setDeletingId(orderId);
    try {
      const r = await fetch(
        `/api/orders?id=${encodeURIComponent(orderId)}`,
        {
          method: "DELETE",
          headers: { "x-admin-secret": secret.trim() },
        }
      );
      if (!r.ok) {
        setError(t("admin.deleteErr"));
        return;
      }
      setOrders((prev) => {
        const next = prev.filter((o) => o.id !== orderId);
        syncAdminOrdersKnownIdsRef(ordersKnownIdsRef, next);
        return next;
      });
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setDeletingId(null);
    }
  };

  const saveInventory = async (nextManualIds, nextPattyStock) => {
    if (!secret.trim()) return;
    setError("");
    setInvSaving(true);
    try {
      const body = {
        unavailableIds:
          nextManualIds !== undefined ? nextManualIds : manualUnavailableIds,
      };
      if (nextPattyStock !== undefined) {
        body.pattyStock = nextPattyStock;
      }
      const r = await fetch("/api/inventory", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret.trim(),
        },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(
          d.error === "admin_not_configured"
            ? t("admin.errConfig")
            : t("admin.inventoryErr")
        );
        return;
      }
      if (Array.isArray(d.manualUnavailableIds)) {
        setManualUnavailableIds(d.manualUnavailableIds);
      }
      if (Object.prototype.hasOwnProperty.call(d, "pattyStock")) {
        setPattyStock(
          d.pattyStock && typeof d.pattyStock === "object"
            ? d.pattyStock
            : null
        );
      }
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setInvSaving(false);
    }
  };

  const savePattyDraftToServer = () => {
    /** @type {Record<number, number>} */
    const o = {};
    for (const g of PATTY_GRAMS_ORDER) {
      const v = parseInt(String(pattyDraft[g] ?? "").trim(), 10);
      o[g] = Number.isFinite(v) && v >= 0 ? Math.min(1e7, v) : 0;
    }
    void saveInventory(undefined, o);
  };

  const disablePattyTracking = () => {
    void saveInventory(undefined, null);
  };

  const toggleMainItemAvailable = (productId, checked) => {
    const auto = new Set(inventoryAutoBlockedIds);
    if (checked) {
      if (auto.has(productId)) return;
      const next = manualUnavailableIds.filter((id) => id !== productId);
      void saveInventory(next);
    } else {
      const next = [...new Set([...manualUnavailableIds, productId])];
      void saveInventory(next);
    }
  };

  const updateHoursDay = (weekday, patch) => {
    setHoursDraft((prev) =>
      prev
        ? prev.map((row) =>
            row.weekday === weekday ? { ...row, ...patch } : row
          )
        : null
    );
  };

  const updateDiscountDraft = (patch) => {
    setDiscountDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const loadHomeSlider = async () => {
    try {
      const headers = {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      };
      if (secret.trim()) {
        headers["x-admin-secret"] = secret.trim();
      }
      const r = await fetch(`/api/home-slider?_=${Date.now()}`, {
        cache: "no-store",
        headers,
        signal: sliderAdminFetchSignal(),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.ok && Array.isArray(d.images)) {
        setSliderImages(d.images);
        if (typeof d.displayEnabled === "boolean") {
          setSliderDisplayEnabled(d.displayEnabled);
        }
      } else {
        setSliderImages([]);
      }
    } catch {
      setSliderImages([]);
    }
  };

  useEffect(() => {
    if (!loaded || !sliderPanelOpen) return;
    void loadHomeSlider();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- טעינה כשהפאנל פתוח ו-secret כבר ב-state
  }, [loaded, sliderPanelOpen]);

  const patchSliderDisplay = async (enabled) => {
    if (!secret.trim()) return;
    setError("");
    try {
      const r = await fetch("/api/home-slider", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret.trim(),
        },
        body: JSON.stringify({ displayEnabled: enabled }),
        signal: sliderAdminFetchSignal(),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.ok) {
        if (typeof d.displayEnabled === "boolean") {
          setSliderDisplayEnabled(d.displayEnabled);
        }
        if (Array.isArray(d.images)) {
          setSliderImages(d.images);
        }
        setSliderMsg(t("admin.sliderDisplaySaved"));
      } else {
        setError(t("admin.sliderPersistErr"));
      }
    } catch {
      setError(t("admin.errNet"));
    }
  };

  const uploadSliderFromPhone = async (fileOverride) => {
    const adminSecret = resolveAdminSecret(secret);
    if (!adminSecret) return;
    if (!secret.trim() && adminSecret) setSecret(adminSecret);
    const file =
      fileOverride instanceof File
        ? fileOverride
        : sliderFileRef.current?.files?.[0];
    if (!file) {
      setSliderMsg("");
      setError(t("admin.sliderErrMissing"));
      return;
    }
    setError("");
    setSliderMsg("");
    setSliderUploading(true);
    try {
      const prepared = await prepareSliderImageForUpload(file);
      const imageBase64 = await blobToBase64PngOrJpeg(prepared);
      const r = await fetch("/api/home-slider/upload-b64", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ imageBase64 }),
        signal: sliderAdminFetchSignal(),
        credentials: "same-origin",
        cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) {
        if (d?.error === "slider_upload_requires_kv") {
          setError(t("admin.sliderUploadRequiresKv"));
        } else if (d?.error === "file_too_large" || r.status === 413) {
          setError(t("admin.sliderUploadTooLarge"));
        } else if (d?.error === "slider_max_images") {
          setError(t("admin.sliderMaxImages"));
        } else if (d?.error === "invalid_image") {
          setError(t("admin.sliderUploadInvalidImage"));
        } else {
          setError(t("admin.sliderUploadFailed"));
        }
        return;
      }
      if (Array.isArray(d.images)) {
        setSliderImages(d.images);
      }
      if (sliderFileRef.current) sliderFileRef.current.value = "";
      setSliderMsg(t("admin.sliderUploadedKv"));
      writePersistedAdminSecret(adminSecret);
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setSliderUploading(false);
    }
  };

  const deleteSliderKvImage = async (img) => {
    const adminSecret = resolveAdminSecret(secret);
    if (!adminSecret) return;
    if (!secret.trim() && adminSecret) setSecret(adminSecret);
    const id = String(img?.id || "");
    if (!id.startsWith("kv-")) return;
    const raw = id.slice(3);
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("admin.sliderKvDeleteConfirm"))
    ) {
      return;
    }
    setError("");
    setSliderMsg("");
    try {
      const r = await fetch(
        `/api/home-slider/upload?id=${encodeURIComponent(raw)}`,
        {
          method: "DELETE",
          headers: { "x-admin-secret": adminSecret },
          signal: sliderAdminFetchSignal(),
          credentials: "same-origin",
          cache: "no-store",
        }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) {
        setError(t("admin.sliderDeleteErr"));
        await loadHomeSlider();
        return;
      }
      if (Array.isArray(d.images)) {
        setSliderImages(d.images);
      }
      setSliderMsg(t("admin.sliderKvDeleted"));
    } catch {
      setError(t("admin.errNet"));
      await loadHomeSlider();
    }
  };

  const togglePromoPanel = async () => {
    const next = !promoOpen;
    setPromoOpen(next);
    try {
      window.sessionStorage.setItem(
        ADMIN_PROMO_PANEL_SESSION_KEY,
        next ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
    if (next) {
      if (loaded && promo == null) {
        try {
          const pr = await fetch("/api/promo");
          const pd = await pr.json().catch(() => ({}));
          if (pr.ok && pd.ok) {
            setPromo(pd);
          }
        } catch {
          /* ignore */
        }
      }
    }
  };

  const toggleSliderPanel = () => {
    setSliderPanelOpen((prev) => {
      const next = !prev;
      try {
        window.sessionStorage.setItem(
          ADMIN_SLIDER_PANEL_SESSION_KEY,
          next ? "1" : "0"
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const uploadPromoVideo = async () => {
    if (!secret.trim()) return;
    const file = promoFileRef.current?.files?.[0];
    if (!file) {
      setError(t("admin.promoErrMissing"));
      return;
    }
    setError("");
    setPromoMsg("");
    setPromoUploading(true);
    try {
      let uploadedWithBlob = false;
      let blobUploadError = "";
      try {
        await uploadToBlob(`promo-${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/promo/blob",
          clientPayload: JSON.stringify({ adminSecret: secret.trim() }),
          multipart: true,
        });
        uploadedWithBlob = true;
      } catch (blobErr) {
        const msg = String(blobErr?.message || "");
        blobUploadError = msg;
        const isBlobDisabled =
          msg.includes("blob_not_configured") ||
          msg.includes("BLOB_READ_WRITE_TOKEN");
        if (isBlobDisabled) {
          setError(t("admin.promoErrBlobConfig"));
          return;
        }
      }

      const isLocalHost =
        typeof window !== "undefined" &&
        ["localhost", "127.0.0.1"].includes(window.location.hostname);

      if (!uploadedWithBlob && !isLocalHost) {
        setError(
          `${t("admin.promoErrBlobUpload")}${
            blobUploadError ? ` (${blobUploadError})` : ""
          }`
        );
        return;
      }

      if (!uploadedWithBlob) {
        const fd = new FormData();
        fd.append("video", file);
        const r = await fetch("/api/promo", {
          method: "POST",
          headers: { "x-admin-secret": secret.trim() },
          body: fd,
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (d.error === "admin_not_configured") {
            setError(t("admin.errConfig"));
          } else if (d.error === "unauthorized") {
            setError(t("admin.errAuth"));
          } else if (d.error === "file_too_large" || r.status === 413) {
            const maxMb = Number(d?.maxMb) || 0;
            if (maxMb > 0 && maxMb <= 5) {
              setError(t("admin.promoErrTooLargeVercel"));
            } else {
              setError(t("admin.promoErrTooLarge"));
            }
          } else if (d.error === "parse_failed") {
            setError(t("admin.promoErrTooLarge"));
          } else if (d.error === "invalid_type") {
            setError(t("admin.promoErrInvalidType"));
          } else if (d.error === "save_failed") {
            setError(t("admin.promoErrSave"));
          } else {
            setError(t("admin.promoErrUpload"));
          }
          return;
        }
      }

      const fresh = await fetch("/api/promo");
      const freshData = await fresh.json().catch(() => ({}));
      if (fresh.ok && freshData?.ok) {
        setPromo(freshData);
      }
      if (promoFileRef.current) promoFileRef.current.value = "";
      setPromoMsg(t("admin.promoUploaded"));
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setPromoUploading(false);
    }
  };

  const uploadCatalogMenuImage = async () => {
    if (!secret.trim() || !catalogModal) return;
    const file = catalogImageFileRef.current?.files?.[0];
    if (!file) {
      setCatalogMsg("");
      setError(t("admin.sliderErrMissing"));
      return;
    }
    setError("");
    setCatalogMsg("");
    setCatalogImageUploading(true);
    try {
      const result = await uploadToBlob(
        `catalog-${Date.now()}-${file.name}`,
        file,
        {
          access: "public",
          handleUploadUrl: "/api/catalog/blob",
          clientPayload: JSON.stringify({ adminSecret: secret.trim() }),
          multipart: true,
        }
      );
      const url = String(result?.url || "");
      if (!url) {
        setCatalogMsg(t("admin.catalogErr"));
        return;
      }
      setCatalogModal((prev) =>
        prev ? { ...prev, draft: { ...prev.draft, image: url } } : null
      );
      setCatalogMsg(t("admin.catalogImageUploaded"));
      if (catalogImageFileRef.current) catalogImageFileRef.current.value = "";
    } catch (blobErr) {
      const msg = String(blobErr?.message || "");
      const isBlobDisabled =
        msg.includes("blob_not_configured") ||
        msg.includes("BLOB_READ_WRITE_TOKEN");
      if (isBlobDisabled) {
        setError(t("admin.promoErrBlobConfig"));
      } else if (msg) {
        setError(`${t("admin.promoErrBlobUpload")} (${msg})`);
      } else {
        setError(t("admin.errNet"));
      }
    } finally {
      setCatalogImageUploading(false);
    }
  };

  const savePromoEnabled = async (enabled) => {
    if (!secret.trim() || !promo) return;
    setError("");
    setPromoMsg("");
    setPromoSaving(true);
    try {
      const r = await fetch("/api/promo", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret.trim(),
        },
        body: JSON.stringify({ enabled }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.error === "admin_not_configured") {
          setError(t("admin.errConfig"));
        } else if (d.error === "unauthorized") {
          setError(t("admin.errAuth"));
        } else {
          setError(t("admin.promoErrUpload"));
        }
        return;
      }
      setPromo(d);
      setPromoMsg(t("admin.promoSaved"));
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setPromoSaving(false);
    }
  };

  const saveBusinessHours = async () => {
    if (!secret.trim() || !hoursDraft) return;
    setError("");
    setHoursMsg("");
    setHoursSaving(true);
    try {
      const r = await fetch("/api/business-hours", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret.trim(),
        },
        body: JSON.stringify({ days: hoursDraft }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.error === "admin_not_configured") {
          setError(t("admin.errConfig"));
        } else if (d.error === "unauthorized") {
          setError(t("admin.errAuth"));
        } else if (d.error === "invalid_time") {
          setError(t("admin.hoursErrInvalidTime"));
        } else if (d.error === "open_after_close") {
          setError(t("admin.hoursErrCloseBeforeOpen"));
        } else if (d.error === "invalid_days") {
          setError(t("admin.hoursErrInvalidDays"));
        } else if (d.error === "storage_failed") {
          setError(t("admin.hoursErrStorage"));
        } else {
          setError(t("admin.hoursErr"));
        }
        return;
      }
      if (Array.isArray(d.days)) {
        setHoursDraft(d.days.map((x) => ({ ...x })));
      }
      setHoursMsg(t("admin.hoursSaved"));
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setHoursSaving(false);
    }
  };

  const saveDiscountConfig = async () => {
    if (!secret.trim() || !discountDraft) return;
    setError("");
    setDiscountMsg("");
    setDiscountSaving(true);
    try {
      const r = await fetch("/api/discount", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret.trim(),
        },
        body: JSON.stringify({
          enabled: Boolean(discountDraft.enabled),
          percent: Number(discountDraft.percent) || 0,
          minOrderTotal: Number(discountDraft.minOrderTotal) || 0,
          reason: String(discountDraft.reason ?? ""),
          couponEnabled: Boolean(discountDraft.couponEnabled),
          couponPercent: Number(discountDraft.couponPercent) || 0,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(
          d.error === "admin_not_configured"
            ? t("admin.errConfig")
            : t("admin.discountErr")
        );
        return;
      }
      setDiscountDraft({
        enabled: Boolean(d.enabled),
        percent: Number(d.percent) || 0,
        minOrderTotal: Number(d.minOrderTotal) || 0,
        reason: String(d.reason ?? ""),
        couponEnabled: Boolean(d.couponEnabled),
        couponPercent: Number(d.couponPercent) || 0,
      });
      setDiscountMsg(t("admin.discountSaved"));
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setDiscountSaving(false);
    }
  };

  const shiftCalMonth = (delta) => {
    setCalView(({ y, m }) => {
      let nm = m + delta;
      let ny = y;
      while (nm > 12) {
        nm -= 12;
        ny += 1;
      }
      while (nm < 1) {
        nm += 12;
        ny -= 1;
      }
      return { y: ny, m: nm };
    });
  };

  const goToToday = () => {
    const k = jerusalemDayKey();
    const { y, m } = parseDayKey(k);
    setSelectedDayKey(k);
    setCalView({ y, m });
  };

  const todayKey = jerusalemDayKey();
  const { y: vy, m: vm } = calView;
  const dim = daysInMonth(vy, vm);
  const lead = weekdaySun0(vy, vm, 1);
  const calendarCells = [];
  for (let i = 0; i < lead; i += 1) calendarCells.push(null);
  for (let d = 1; d <= dim; d += 1) {
    calendarCells.push(dayKeyFromParts(vy, vm, d));
  }
  const selectedDayOrders =
    selectedDayKey != null ? ordersByDay.get(selectedDayKey) ?? [] : [];
  const nowTs = Date.now();

  const exportMenuSheetPng = async () => {
    const el = menuExportRef.current;
    if (!el || menuExportBusy) return;
    setMenuExportBusy(true);
    setMenuExportErr("");
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const a = document.createElement("a");
      a.download = "burger-hut-menu.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch {
      setMenuExportErr(t("admin.catalogExportErr"));
    } finally {
      setMenuExportBusy(false);
    }
  };

  const exportMenuSheetPdf = async () => {
    const el = menuExportRef.current;
    if (!el || menuExportBusy) return;
    setMenuExportBusy(true);
    setMenuExportErr("");
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const { jsPDF } = await import("jspdf");
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
      pdf.save("burger-hut-menu.pdf");
    } catch {
      setMenuExportErr(t("admin.catalogExportErr"));
    } finally {
      setMenuExportBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>{t("admin.title")}</title>
      </Head>
      <div className="min-h-screen bg-black text-gray-100" dir="rtl">
        <header className="border-b border-slate-800 bg-slate-950/80 px-4 py-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-primary">{t("admin.title")}</h1>
              <p className="text-xs text-gray-500">{t("admin.hint")}</p>
              <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-gray-500">
                {t("admin.secretStorageHint")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {loaded ? (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      typeof window !== "undefined" &&
                      !window.confirm(t("admin.logoutConfirm"))
                    ) {
                      return;
                    }
                    logoutAdmin();
                  }}
                  className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950/50"
                >
                  {t("admin.logoutBtn")}
                </button>
              ) : null}
              <Link
                href="/"
                className="text-xs font-semibold text-primary underline-offset-4 hover:text-amber-400 hover:underline"
              >
                {t("admin.backHome")}
              </Link>
              <LanguageSwitcher />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6">
          <form
            onSubmit={load}
            className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-400">
                {t("admin.secretLabel")}
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder={t("admin.secretPh")}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !secret.trim()}
              className="btn-primary whitespace-nowrap px-6 text-sm disabled:opacity-50"
            >
              {loading ? t("admin.loading") : t("admin.load")}
            </button>
          </form>

          {error ? (
            <p className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          {loaded ? (
            <>
              <p className="mb-3 text-[11px] leading-snug text-gray-500">
                {t("admin.newOrderAutoRefreshHint")}
              </p>
              {adminClientReady && typeof Notification !== "undefined" ? (
                <>
                  {Notification.permission === "default" ? (
                    <div className="mb-4 rounded-xl border border-amber-700/45 bg-amber-950/35 px-3 py-2.5 text-xs text-amber-100">
                      <p className="mb-2 leading-snug">
                        {t("admin.newOrderNotifyHint")}
                      </p>
                      <button
                        type="button"
                        className="rounded-lg border border-amber-500/60 bg-amber-900/40 px-3 py-1.5 text-[11px] font-semibold text-amber-50 hover:bg-amber-900/55"
                        onClick={async () => {
                          setAdminPushMsg("");
                          try {
                            await Notification.requestPermission();
                          } catch {
                            /* ignore */
                          }
                          setNotifyPermissionNonce((n) => n + 1);
                          if (typeof Notification === "undefined") return;
                          if (Notification.permission !== "granted") return;
                          const r = await subscribeAdminWebPush(secret.trim());
                          if (r.ok) {
                            setAdminPushMsg(t("admin.pushSubscribeOk"));
                            setAdminLocalPushSubscribed(true);
                            void refreshAdminPushServerStatus();
                          } else if (
                            r.error === "no_vapid" ||
                            r.error === "push_unavailable"
                          )
                            setAdminPushMsg(t("admin.pushSubscribeSkip"));
                          else if (r.error === "redis_not_configured")
                            setAdminPushMsg(t("admin.pushSubscribeRedis"));
                          else if (
                            r.error === "no_push_client_id" ||
                            r.error === "invalid_push_client_id"
                          )
                            setAdminPushMsg(t("admin.pushSubscribeClientId"));
                          else setAdminPushMsg(t("admin.pushSubscribeErr"));
                        }}
                      >
                        {t("admin.newOrderNotifyEnable")}
                      </button>
                    </div>
                  ) : Notification.permission === "granted" ? (
                    <div className="mb-4 rounded-xl border border-emerald-800/50 bg-emerald-950/25 px-3 py-2.5 text-xs text-emerald-100/95">
                      {adminLocalPushSubscribed === true ? (
                        <p className="mb-2 leading-snug">
                          {t("admin.pushLocalActive")}
                        </p>
                      ) : adminLocalPushSubscribed === null ? (
                        <p className="mb-2 leading-snug text-emerald-100/70">
                          {t("admin.pushCheckingLocal")}
                        </p>
                      ) : (
                        <p className="mb-2 leading-snug">
                          {t("admin.newOrderNotifyGrantedHint")}
                        </p>
                      )}
                      <button
                        type="button"
                        className="rounded-lg border border-emerald-600/50 bg-emerald-900/35 px-3 py-1.5 text-[11px] font-semibold text-emerald-50 hover:bg-emerald-900/50"
                        onClick={async () => {
                          setAdminPushMsg("");
                          const r = await subscribeAdminWebPush(secret.trim());
                          if (r.ok) {
                            setAdminPushMsg(t("admin.pushSubscribeOk"));
                            setAdminLocalPushSubscribed(true);
                            void refreshAdminPushServerStatus();
                          } else if (
                            r.error === "no_vapid" ||
                            r.error === "push_unavailable"
                          )
                            setAdminPushMsg(t("admin.pushSubscribeSkip"));
                          else if (r.error === "redis_not_configured")
                            setAdminPushMsg(t("admin.pushSubscribeRedis"));
                          else if (
                            r.error === "no_push_client_id" ||
                            r.error === "invalid_push_client_id"
                          )
                            setAdminPushMsg(t("admin.pushSubscribeClientId"));
                          else setAdminPushMsg(t("admin.pushSubscribeErr"));
                        }}
                      >
                        {adminLocalPushSubscribed === true
                          ? t("admin.pushReregisterBtn")
                          : t("admin.pushRegisterBtn")}
                      </button>
                      <p className="mt-2 leading-snug text-emerald-100/75">
                        {t("admin.pushPerDeviceHint")}
                      </p>
                    </div>
                  ) : Notification.permission === "denied" ? (
                    <div className="mb-4 space-y-2 text-[11px] leading-snug text-gray-500">
                      <p>{t("admin.newOrderNotifyDenied")}</p>
                      <p className="text-gray-400">{t("admin.newOrderNotifyDeniedHelp")}</p>
                    </div>
                  ) : null}
                  {adminPushMsg ? (
                    <p className="mb-4 text-[11px] leading-snug text-emerald-300/90">
                      {adminPushMsg}
                    </p>
                  ) : null}
                </>
              ) : null}
              {adminPushServerStatus ? (
                <div className="mb-4 space-y-2">
                  <p className="text-[11px] leading-snug text-gray-500">
                    {t("admin.pushStatusLine")
                      .replace(
                        "{vapid}",
                        adminPushServerStatus.vapidConfigured
                          ? t("admin.pushStatusOn")
                          : t("admin.pushStatusOff")
                      )
                      .replace(
                        "{redis}",
                        adminPushServerStatus.redisConfigured
                          ? t("admin.pushStatusOn")
                          : t("admin.pushStatusOff")
                      )
                      .replace(
                        "{count}",
                        String(adminPushServerStatus.subscriptionCount)
                      )}
                  </p>
                  {adminPushServerStatus.redisConfigured ? (
                    <button
                      type="button"
                      disabled={adminPushClearBusy || !secret.trim()}
                      className="rounded-lg border border-red-900/55 bg-red-950/35 px-3 py-1.5 text-[11px] font-semibold text-red-200/95 hover:bg-red-950/55 disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={async () => {
                        if (!secret.trim()) return;
                        if (
                          typeof window !== "undefined" &&
                          !window.confirm(t("admin.pushClearAllConfirm"))
                        ) {
                          return;
                        }
                        setAdminPushClearMsg("");
                        setAdminPushClearBusy(true);
                        try {
                          const r = await fetch("/api/admin/push/clear-all", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              "x-admin-secret": secret.trim(),
                            },
                            cache: "no-store",
                          });
                          const d = await r.json().catch(() => ({}));
                          if (r.ok && d.ok) {
                            setAdminPushClearMsg(t("admin.pushClearAllOk"));
                            setAdminPushServerStatus((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    subscriptionCount:
                                      Number(d.subscriptionCount) || 0,
                                  }
                                : prev
                            );
                            void refreshAdminPushServerStatus();
                          } else if (d.error === "redis_not_configured") {
                            setAdminPushClearMsg(t("admin.pushClearAllRedis"));
                          } else if (d.error === "clear_verify_failed") {
                            setAdminPushClearMsg(t("admin.pushClearAllVerifyErr"));
                          } else {
                            setAdminPushClearMsg(t("admin.pushClearAllErr"));
                          }
                        } catch {
                          setAdminPushClearMsg(t("admin.pushClearAllErr"));
                        } finally {
                          setAdminPushClearBusy(false);
                        }
                      }}
                    >
                      {adminPushClearBusy
                        ? t("admin.pushClearAllWorking")
                        : t("admin.pushClearAllBtn")}
                    </button>
                  ) : null}
                  {adminPushClearMsg ? (
                    <p className="text-[11px] leading-snug text-amber-200/90">
                      {adminPushClearMsg}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mb-8 space-y-3">
              <button
                type="button"
                onClick={() => setCatalogOpen((v) => !v)}
                aria-expanded={catalogOpen}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
              >
                <span className="min-w-0 flex-1 leading-snug">
                  {t("admin.catalogTitle")}
                </span>
                <span
                  className="shrink-0 text-lg leading-none text-primary"
                  aria-hidden
                >
                  {catalogOpen ? "▾" : "▶"}
                </span>
              </button>
              {catalogOpen ? (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="mb-4 text-[11px] text-gray-500">
                    {t("admin.catalogHint")}
                  </p>
                  <p className="mb-2 text-[11px] text-gray-500">
                    {t("admin.catalogExportHint")}
                  </p>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={menuExportBusy || !mergedCatalogItems.length}
                      onClick={() => void exportMenuSheetPng()}
                      className="rounded-lg border border-emerald-800/60 bg-emerald-950/25 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-50"
                    >
                      {menuExportBusy
                        ? t("admin.catalogExportBusy")
                        : t("admin.catalogExportPng")}
                    </button>
                    <button
                      type="button"
                      disabled={menuExportBusy || !mergedCatalogItems.length}
                      onClick={() => void exportMenuSheetPdf()}
                      className="rounded-lg border border-sky-800/60 bg-sky-950/25 px-3 py-1.5 text-[11px] font-semibold text-sky-200 hover:bg-sky-950/40 disabled:opacity-50"
                    >
                      {menuExportBusy
                        ? t("admin.catalogExportBusy")
                        : t("admin.catalogExportPdf")}
                    </button>
                  </div>
                  {menuExportErr ? (
                    <p className="mb-3 text-xs text-red-400/95">
                      {menuExportErr}
                    </p>
                  ) : null}
                  {catalogSaving ? (
                    <p className="mb-3 text-xs text-amber-400/90">
                      {t("admin.catalogSaving")}
                    </p>
                  ) : null}
                  {catalogMsg ? (
                    <p className="mb-3 text-xs text-emerald-400/95">{catalogMsg}</p>
                  ) : null}
                  <div className="space-y-5">
                    {CATALOG_CATEGORIES.map((catId) => {
                      const catItems = mergedCatalogItems
                        .filter((row) => row.category === catId)
                        .sort((a, b) => a.basePrice - b.basePrice);
                      return (
                        <div key={catId}>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-xs font-semibold text-primary">
                              {t(`cat.${catId}`)}
                            </h3>
                            <button
                              type="button"
                              disabled={catalogSaving || !secret.trim()}
                              onClick={() => openCatalogAdd(catId)}
                              className="rounded-lg border border-primary/40 bg-slate-950 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-slate-900 disabled:opacity-50"
                            >
                              {t("admin.catalogAdd")}
                            </button>
                          </div>
                          {catItems.length ? (
                            <ul className="space-y-2">
                              {catItems.map((row) => (
                                <li
                                  key={row.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/40 px-2 py-2"
                                >
                                  <span className="min-w-0 flex-1 text-xs text-gray-300">
                                    {menuItemName(row, t, locale)}
                                    <span className="mr-2 text-[10px] text-gray-500">
                                      ({row.id}) · ₪{row.basePrice}
                                    </span>
                                  </span>
                                  <div className="flex shrink-0 flex-wrap gap-1">
                                    <button
                                      type="button"
                                      disabled={catalogSaving || !secret.trim()}
                                      onClick={() => openCatalogEdit(row)}
                                      className="rounded border border-slate-600 px-2 py-0.5 text-[11px] text-gray-200 hover:border-primary disabled:opacity-50"
                                    >
                                      {t("admin.catalogEdit")}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={catalogSaving || !secret.trim()}
                                      onClick={() => removeCatalogItem(row)}
                                      className="rounded border border-red-900/60 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-950/30 disabled:opacity-50"
                                    >
                                      {t("admin.catalogRemove")}
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[11px] text-gray-600">
                              —
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {catalogEditor.hiddenIds.length ? (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold text-amber-500/90">
                          {t("admin.catalogHiddenTitle")}
                        </h3>
                        <ul className="space-y-2">
                          {catalogEditor.hiddenIds.map((hid) => {
                            const base = MENU_ITEMS.find((m) => m.id === hid);
                            if (!base) return null;
                            return (
                              <li
                                key={hid}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/40 px-2 py-2"
                              >
                                <span className="text-xs text-gray-400">
                                  {t(`menu.${hid}.name`)}{" "}
                                  <span className="text-[10px] text-gray-600">
                                    ({hid})
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  disabled={catalogSaving || !secret.trim()}
                                  onClick={() => restoreHiddenCatalogItem(hid)}
                                  className="shrink-0 rounded border border-emerald-800/60 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-950/20 disabled:opacity-50"
                                >
                                  {t("admin.catalogRestore")}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <button
                type="button"
                onClick={() => setInventoryOpen((v) => !v)}
                aria-expanded={inventoryOpen}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
              >
                <span className="min-w-0 flex-1 leading-snug">
                  {t("admin.inventoryTitle")}
                </span>
                <span
                  className="shrink-0 text-lg leading-none text-primary"
                  aria-hidden
                >
                  {inventoryOpen ? "▾" : "▶"}
                </span>
              </button>
              {inventoryOpen ? (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="mb-4 text-[11px] text-gray-500">
                    {t("admin.inventoryHint")}
                  </p>
                  {invSaving ? (
                    <p className="mb-3 text-xs text-amber-400/90">
                      {t("admin.inventorySaving")}
                    </p>
                  ) : null}
                  <div className="space-y-5">
                    <div className="rounded-xl border border-amber-900/40 bg-amber-950/15 p-3">
                      <h3 className="mb-1 text-xs font-semibold text-amber-200">
                        {t("admin.inventoryPattySectionTitle")}
                      </h3>
                      <p className="mb-3 text-[10px] leading-relaxed text-gray-500">
                        {t("admin.inventoryPattyHint")}
                      </p>
                      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {PATTY_GRAMS_ORDER.map((g) => (
                          <label
                            key={g}
                            className="flex flex-col gap-0.5 text-[11px] text-gray-400"
                          >
                            <span>
                              {t("admin.inventoryPattyGramLabel").replace(
                                "{g}",
                                String(g)
                              )}
                            </span>
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              disabled={invSaving}
                              value={pattyDraft[g] ?? ""}
                              onChange={(e) =>
                                setPattyDraft((prev) => ({
                                  ...prev,
                                  [g]: e.target.value,
                                }))
                              }
                              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-gray-100"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={invSaving}
                          onClick={() => savePattyDraftToServer()}
                          className="rounded-lg border border-amber-600/60 bg-amber-950/40 px-3 py-1.5 text-[11px] font-semibold text-amber-100 hover:bg-amber-950/60 disabled:opacity-50"
                        >
                          {t("admin.inventoryPattySave")}
                        </button>
                        <button
                          type="button"
                          disabled={invSaving || pattyStock == null}
                          onClick={() => disablePattyTracking()}
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] text-gray-400 hover:bg-slate-900 disabled:opacity-40"
                        >
                          {t("admin.inventoryPattyDisableTracking")}
                        </button>
                      </div>
                    </div>
                    {INVENTORY_CATEGORIES.map((catId) => {
                      const catItems = mergedMainForInventory.filter(
                        (row) => row.category === catId
                      );
                      if (!catItems.length) return null;
                      return (
                        <div key={catId}>
                          <h3 className="mb-2 text-xs font-semibold text-primary">
                            {t(`cat.${catId}`)}
                          </h3>
                          <ul className="space-y-2">
                            {catItems.map((row) => {
                              const available =
                                !inventoryEffectiveUnavailableSet.has(row.id);
                              const autoOnly =
                                inventoryAutoBlockedIds.includes(row.id) &&
                                !manualUnavailableIds.includes(row.id);
                              return (
                                <li key={row.id}>
                                  <label
                                    className={`flex cursor-pointer items-start gap-2 text-xs text-gray-300 ${
                                      autoOnly ? "opacity-90" : ""
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={available}
                                      disabled={invSaving || autoOnly}
                                      onChange={(e) =>
                                        toggleMainItemAvailable(
                                          row.id,
                                          e.target.checked
                                        )
                                      }
                                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary disabled:cursor-not-allowed"
                                    />
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                      <span>
                                        {menuItemName(row, t, locale)}
                                      </span>
                                      {autoOnly ? (
                                        <span className="text-[10px] text-amber-500/90">
                                          {t("admin.inventoryPattyAutoBadge")}
                                        </span>
                                      ) : null}
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                    <div>
                      <h3 className="mb-2 text-xs font-semibold text-primary">
                        {t("admin.inventoryBurgerToppings")}
                      </h3>
                      <ul className="space-y-2">
                        {BURGER_TOPPINGS.map((row) => {
                          const available =
                            !inventoryEffectiveUnavailableSet.has(row.id);
                          return (
                            <li key={row.id}>
                              <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={available}
                                  disabled={invSaving}
                                  onChange={(e) =>
                                    toggleMainItemAvailable(
                                      row.id,
                                      e.target.checked
                                    )
                                  }
                                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                                />
                                <span>{t(`topping.${row.id}`)}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    {INVENTORY_MANAGED_SALADS.length > 0 ? (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold text-primary">
                          {t("admin.inventorySalads")}
                        </h3>
                        <ul className="space-y-2">
                          {INVENTORY_MANAGED_SALADS.map((row) => {
                            const available =
                              !inventoryEffectiveUnavailableSet.has(row.id);
                            return (
                              <li key={row.id}>
                                <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-300">
                                  <input
                                    type="checkbox"
                                    checked={available}
                                    disabled={invSaving}
                                    onChange={(e) =>
                                      toggleMainItemAvailable(
                                        row.id,
                                        e.target.checked
                                      )
                                    }
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                                  />
                                  <span>{t(`salad.${row.id}`)}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <button
                type="button"
                onClick={togglePromoPanel}
                aria-expanded={promoOpen}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
              >
                <span className="min-w-0 flex-1 leading-snug">
                  {t("admin.promoTitle")}
                </span>
                <span
                  className="shrink-0 text-lg leading-none text-primary"
                  aria-hidden
                >
                  {promoOpen ? "▾" : "▶"}
                </span>
              </button>
              {promoOpen ? (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="mb-4 text-[11px] text-gray-500">
                    {t("admin.promoHint")}
                  </p>

                  <div className="mb-6">
                    <h4 className="mb-2 text-xs font-bold text-primary">
                      {t("admin.promoVideoSection")}
                    </h4>
                    {promo ? (
                      <>
                        <p className="mb-3 text-xs font-medium text-gray-300">
                          {promo.hasFile
                            ? promo.active
                              ? t("admin.promoStatusOn")
                              : t("admin.promoStatusOff")
                            : t("admin.promoNoFile")}
                        </p>
                        {promoMsg ? (
                          <p className="mb-3 text-xs font-medium text-emerald-400/95">
                            {promoMsg}
                          </p>
                        ) : null}
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            ref={promoFileRef}
                            type="file"
                            accept="video/*"
                            disabled={promoUploading}
                            className="max-w-full text-xs text-gray-400 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-gray-200"
                          />
                          <button
                            type="button"
                            onClick={uploadPromoVideo}
                            disabled={promoUploading || !secret.trim()}
                            className="btn-primary shrink-0 text-sm disabled:opacity-50"
                          >
                            {promoUploading
                              ? t("admin.promoUploading")
                              : t("admin.promoUploadBtn")}
                          </button>
                        </div>
                        {promo.hasFile ? (
                          <div className="rounded-xl border border-slate-700/80 bg-slate-950/40 p-3">
                            <h4 className="mb-2 text-xs font-bold text-primary">
                              {t("admin.promoHomeDisplaySection")}
                            </h4>
                            <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
                              {t("admin.promoShowOnHomeHint")}
                            </p>
                            <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-200">
                              <input
                                type="checkbox"
                                checked={Boolean(promo.enabled)}
                                disabled={promoSaving}
                                onChange={(e) =>
                                  savePromoEnabled(e.target.checked)
                                }
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                              />
                              <span className="font-medium leading-snug">
                                {t("admin.promoShowOnHomeCheckbox")}
                              </span>
                            </label>
                            {promoSaving ? (
                              <p className="mt-2 text-xs text-amber-400/90">
                                {t("admin.promoSaving")}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-xs text-gray-500">
                        {t("admin.promoLoadEmpty")}
                      </p>
                    )}
                  </div>
                </section>
              ) : null}

              <button
                type="button"
                onClick={toggleSliderPanel}
                aria-expanded={sliderPanelOpen}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
              >
                <span className="min-w-0 flex-1 leading-snug">
                  {t("admin.sliderSection")}
                </span>
                <span
                  className="shrink-0 text-lg leading-none text-primary"
                  aria-hidden
                >
                  {sliderPanelOpen ? "▾" : "▶"}
                </span>
              </button>
              {sliderPanelOpen ? (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-700/80 bg-slate-950/50 p-3">
                    <input
                      type="checkbox"
                      checked={sliderDisplayEnabled}
                      disabled={!secret.trim()}
                      onChange={(e) =>
                        void patchSliderDisplay(e.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-500 text-primary focus:ring-2 focus:ring-primary/50"
                    />
                    <span className="min-w-0 flex flex-col gap-1 text-right">
                      <span className="text-xs font-semibold text-gray-200">
                        {t("admin.sliderShowOnHome")}
                      </span>
                      <span className="text-[11px] leading-relaxed text-gray-500">
                        {t("admin.sliderShowOnHomeHintFs")}
                      </span>
                    </span>
                  </label>
                  <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
                    {t("admin.sliderHintFs")}
                  </p>
                  <p className="mb-3 text-[11px] leading-relaxed text-amber-200/80">
                    {t("admin.sliderKvHint")}
                  </p>
                  <p className="mb-3 text-[11px] leading-relaxed text-sky-200/85">
                    <Link
                      href="/admin/slider-upload"
                      className="font-semibold text-sky-300 underline-offset-2 hover:underline"
                    >
                      {t("admin.sliderUploadLitePageLink")}
                    </Link>
                  </p>
                  <div
                    className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center"
                    onPointerDown={(ev) => ev.stopPropagation()}
                  >
                    <input
                      ref={sliderFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={
                        sliderUploading || !resolveAdminSecret(secret)
                      }
                      className="max-w-full text-xs text-gray-400 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-gray-200"
                      onChange={(ev) => {
                        const f = ev.target.files?.[0];
                        if (!f) return;
                        const touch =
                          typeof window !== "undefined" &&
                          ("ontouchstart" in window ||
                            (typeof navigator !== "undefined" &&
                              navigator.maxTouchPoints > 0));
                        const ms = touch ? 500 : 0;
                        window.setTimeout(
                          () => void uploadSliderFromPhone(f),
                          ms
                        );
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void uploadSliderFromPhone()}
                      disabled={
                        sliderUploading || !resolveAdminSecret(secret)
                      }
                      className="btn-primary shrink-0 text-sm disabled:opacity-50"
                    >
                      {sliderUploading
                        ? t("admin.sliderUploadingKv")
                        : t("admin.sliderUploadPhoneBtn")}
                    </button>
                  </div>
                  {sliderMsg ? (
                    <p className="mb-3 text-xs font-medium text-emerald-400/95">
                      {sliderMsg}
                    </p>
                  ) : null}
                  {sliderImages.length ? (
                    <ul className="mb-2 grid gap-2 sm:grid-cols-2">
                      {sliderImages.map((img) => (
                        <li
                          key={img.id}
                          className="flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/40 p-2"
                        >
                          <img
                            src={img.url}
                            alt=""
                            className="h-16 w-24 shrink-0 rounded object-cover"
                          />
                          <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1">
                            <span className="text-[11px] font-medium text-gray-400">
                              {img.id?.startsWith("kv-")
                                ? t("admin.sliderItemKindUpload")
                                : t("admin.sliderItemKindFs")}
                            </span>
                            <span className="sr-only" dir="ltr">
                              {img.url}
                            </span>
                            {img.id?.startsWith("kv-") ? (
                              <button
                                type="button"
                                onClick={() => void deleteSliderKvImage(img)}
                                disabled={
                                  sliderUploading || !resolveAdminSecret(secret)
                                }
                                className="self-start rounded border border-red-900/50 bg-red-950/20 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                              >
                                {t("admin.sliderDeleteKv")}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-2 text-xs text-gray-500">
                      {t("admin.sliderEmptyFs")}
                    </p>
                  )}
                </section>
              ) : null}

              {hoursDraft ? (
                <>
                  <button
                    type="button"
                    onClick={() => setHoursPanelOpen((v) => !v)}
                    aria-expanded={hoursPanelOpen}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
                  >
                    <span className="min-w-0 flex-1 leading-snug">
                      {t("admin.hoursTitle")}
                    </span>
                    <span
                      className="shrink-0 text-lg leading-none text-primary"
                      aria-hidden
                    >
                      {hoursPanelOpen ? "▾" : "▶"}
                    </span>
                  </button>
                  {hoursPanelOpen ? (
                    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                      <p className="mb-4 text-[11px] text-gray-500">
                        {t("admin.hoursHint")}
                      </p>
                      {hoursMsg ? (
                        <p className="mb-3 text-xs font-medium text-emerald-400/95">
                          {hoursMsg}
                        </p>
                      ) : null}
                      <div className="mb-4 space-y-0 divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
                        {hoursDraft.map((d) => (
                          <div
                            key={d.weekday}
                            className="flex flex-wrap items-center gap-3 bg-slate-950/30 px-3 py-2.5"
                          >
                            <span className="min-w-[5.5rem] text-xs font-semibold text-primary">
                              {t(`weekday.${d.weekday}`)}
                            </span>
                            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                              <input
                                type="checkbox"
                                checked={d.enabled}
                                disabled={hoursSaving}
                                onChange={(e) =>
                                  updateHoursDay(d.weekday, {
                                    enabled: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                              />
                              {t("admin.hoursOpen")}
                            </label>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <label className="flex items-center gap-1.5 text-gray-400">
                                <span>{t("admin.hoursOpening")}</span>
                                <input
                                  type="time"
                                  value={d.open}
                                  disabled={!d.enabled || hoursSaving}
                                  onChange={(e) =>
                                    updateHoursDay(d.weekday, {
                                      open: e.target.value,
                                    })
                                  }
                                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                                />
                              </label>
                              <label className="flex items-center gap-1.5 text-gray-400">
                                <span>{t("admin.hoursClosing")}</span>
                                <input
                                  type="time"
                                  value={d.close}
                                  disabled={!d.enabled || hoursSaving}
                                  onChange={(e) =>
                                    updateHoursDay(d.weekday, {
                                      close: e.target.value,
                                    })
                                  }
                                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={saveBusinessHours}
                        disabled={hoursSaving || !secret.trim()}
                        className="btn-primary text-sm disabled:opacity-50"
                      >
                        {hoursSaving
                          ? t("admin.hoursSaving")
                          : t("admin.hoursSave")}
                      </button>
                    </section>
                  ) : null}
                </>
              ) : null}

              {discountDraft ? (
                <>
                  <button
                    type="button"
                    onClick={() => setDiscountPanelOpen((v) => !v)}
                    aria-expanded={discountPanelOpen}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
                  >
                    <span className="min-w-0 flex-1 leading-snug">
                      {t("admin.discountTitle")}
                    </span>
                    <span
                      className="shrink-0 text-lg leading-none text-primary"
                      aria-hidden
                    >
                      {discountPanelOpen ? "▾" : "▶"}
                    </span>
                  </button>
                  {discountPanelOpen ? (
                    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                      <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
                        {t("admin.discountHint")}
                      </p>
                      {discountMsg ? (
                        <p className="mb-3 text-xs font-medium text-emerald-400/95">
                          {discountMsg}
                        </p>
                      ) : null}
                      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                          <input
                            type="checkbox"
                            checked={Boolean(discountDraft.enabled)}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({ enabled: e.target.checked })
                            }
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                          />
                          {t("admin.discountEnabled")}
                        </label>
                        <div className="my-2 border-t border-slate-800" />
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                          <input
                            type="checkbox"
                            checked={Boolean(discountDraft.couponEnabled)}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({ couponEnabled: e.target.checked })
                            }
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                          />
                          {t("admin.couponEnabled")}
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-400">
                          <span>{t("admin.couponPercent")}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={discountDraft.couponPercent}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({ couponPercent: e.target.value })
                            }
                            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-400">
                          <span>{t("admin.discountPercent")}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={discountDraft.percent}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({ percent: e.target.value })
                            }
                            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-400">
                          <span>{t("admin.discountMinOrder")}</span>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={discountDraft.minOrderTotal}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({
                                minOrderTotal: e.target.value,
                              })
                            }
                            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-400">
                          <span>{t("admin.discountReason")}</span>
                          <input
                            type="text"
                            maxLength={180}
                            value={discountDraft.reason || ""}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({ reason: e.target.value })
                            }
                            placeholder={t("admin.discountReasonPh")}
                            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={saveDiscountConfig}
                        disabled={discountSaving || !secret.trim()}
                        className="btn-primary mt-4 text-sm disabled:opacity-50"
                      >
                        {discountSaving
                          ? t("admin.discountSaving")
                          : t("admin.discountSave")}
                      </button>
                    </section>
                  ) : null}
                </>
              ) : null}

              <>
                <button
                  type="button"
                  onClick={() => setCouponPanelOpen((v) => !v)}
                  aria-expanded={couponPanelOpen}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
                >
                  <span className="min-w-0 flex-1 leading-snug">
                    {t("admin.couponsTitle")}
                  </span>
                  <span
                    className="shrink-0 text-lg leading-none text-primary"
                    aria-hidden
                  >
                    {couponPanelOpen ? "▾" : "▶"}
                  </span>
                </button>
                {couponPanelOpen ? (
                  <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                    <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
                      {t("admin.couponsHint")}
                    </p>
                    {!couponsLoading && coupons.length > 0 ? (
                      <div className="mb-4 flex flex-col gap-1.5 rounded-xl border border-slate-800/90 bg-slate-950/50 px-3 py-2.5 text-xs text-gray-300">
                        <p className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-gray-500">
                            {t("admin.couponTotalsUnused")}
                          </span>
                          <span className="font-bold text-cyan-200">
                            ₪{couponValueTotals.unused.toFixed(2)}
                          </span>
                        </p>
                        <p className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-gray-500">
                            {t("admin.couponTotalsUsed")}
                          </span>
                          <span className="font-bold text-amber-200">
                            ₪{couponValueTotals.used.toFixed(2)}
                          </span>
                        </p>
                      </div>
                    ) : null}
                    {couponMsg ? (
                      <p className="mb-3 text-xs font-medium text-emerald-400/95">
                        {couponMsg}
                      </p>
                    ) : null}
                    {couponsLoading ? (
                      <p className="text-xs text-gray-400">{t("admin.loading")}</p>
                    ) : coupons.length === 0 ? (
                      <p className="text-xs text-gray-500">{t("admin.couponsEmpty")}</p>
                    ) : (
                      <>
                        <div
                          className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-3 text-[10px]"
                          role="group"
                          aria-label={t("admin.couponFilterLabel")}
                        >
                          <span className="shrink-0 text-gray-500">
                            {t("admin.couponFilterLabel")}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCouponStatusFilter((prev) =>
                                prev === "unused" ? null : "unused"
                              )
                            }
                            aria-pressed={couponStatusFilter === "unused"}
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              couponStatusFilter === "unused"
                                ? "border-cyan-400 bg-cyan-800/50 text-white ring-1 ring-cyan-400/80"
                                : "border-cyan-700/55 bg-cyan-950/50 text-cyan-200 hover:bg-cyan-900/55"
                            }`}
                          >
                            {t("admin.couponNotUsed")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setCouponStatusFilter((prev) =>
                                prev === "used" ? null : "used"
                              )
                            }
                            aria-pressed={couponStatusFilter === "used"}
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              couponStatusFilter === "used"
                                ? "border-amber-400 bg-amber-800/45 text-white ring-1 ring-amber-400/80"
                                : "border-amber-700/55 bg-amber-950/50 text-amber-200 hover:bg-amber-900/55"
                            }`}
                          >
                            {t("admin.couponUsed")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setCouponStatusFilter((prev) =>
                                prev === "expired" ? null : "expired"
                              )
                            }
                            aria-pressed={couponStatusFilter === "expired"}
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              couponStatusFilter === "expired"
                                ? "border-red-400 bg-red-900/45 text-white ring-1 ring-red-400/80"
                                : "border-red-800/55 bg-red-950/45 text-red-200 hover:bg-red-900/50"
                            }`}
                          >
                            {t("admin.couponExpired")}
                          </button>
                        </div>
                        {(() => {
                          const filteredCoupons =
                            couponStatusFilter == null
                              ? coupons
                              : coupons.filter(
                                  (c) =>
                                    couponDisplayStatus(c, nowTs) ===
                                    couponStatusFilter
                                );
                          if (filteredCoupons.length === 0) {
                            return (
                              <p className="text-xs text-gray-500">
                                {t("admin.couponFilterEmpty")}
                              </p>
                            );
                          }
                          return (
                            <div className="max-h-[26rem] space-y-2 overflow-y-auto pl-1">
                              {filteredCoupons.map((c) => {
                          const expired =
                            Number.isFinite(Number(c.expiresAt)) &&
                            Number(c.expiresAt) > 0 &&
                            Number(c.expiresAt) < nowTs;
                          const used = Boolean(c.used);
                          const redemptionOrder = couponRedemptionOrderDisplay(c);
                          const badge = expired
                            ? {
                                label: t("admin.couponExpired"),
                                className:
                                  "border-red-800/55 bg-red-950/45 text-red-200",
                              }
                            : used
                              ? {
                                  label: t("admin.couponUsed"),
                                  className:
                                    "border-amber-700/55 bg-amber-950/50 text-amber-200",
                                }
                              : {
                                  label: t("admin.couponNotUsed"),
                                  className:
                                    "border-cyan-700/55 bg-cyan-950/50 text-cyan-200",
                                };
                          return (
                            <article
                              key={c.code}
                              className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1 space-y-1 text-xs">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-bold text-primary">
                                      {t("admin.couponCode")}: {c.code}
                                    </p>
                                    <span
                                      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  </div>
                                  <p className="text-gray-300">
                                    {t("admin.couponValue")}: ₪
                                    {Number(c.value || 0).toFixed(2)}
                                  </p>
                                  <p className="text-[11px] text-gray-500">
                                    {t("admin.couponCreatedAt")}:{" "}
                                    {formatCouponDateTime(c.createdAt, locale)}
                                  </p>
                                  <p className="text-[11px] text-gray-500">
                                    {t("admin.couponExpiresAt")}:{" "}
                                    {formatCouponDateTime(c.expiresAt, locale)}
                                  </p>
                                  {couponRewardSourceOrderDisplay(c) ? (
                                    <p className="text-[11px] text-slate-400">
                                      {t("admin.couponRewardFromOrder")}{" "}
                                      <span className="font-semibold text-gray-300">
                                        #
                                        {couponRewardSourceOrderDisplay(c)}
                                      </span>
                                    </p>
                                  ) : null}
                                  {used ? (
                                    <div className="space-y-1 border-t border-slate-800/80 pt-1.5 text-[11px] text-amber-200/90">
                                      <p className="font-semibold text-amber-100/95">
                                        {t("admin.couponRedeemedTitle")}
                                      </p>
                                      {Number(c.usedAt) > 0 ? (
                                        <p>
                                          {t("admin.couponUsedAt")}:{" "}
                                          {formatCouponDateTime(
                                            c.usedAt,
                                            locale
                                          )}
                                        </p>
                                      ) : (
                                        <p className="text-gray-500">
                                          {t("admin.couponUsedAtUnknown")}
                                        </p>
                                      )}
                                      <p>
                                        {t("admin.couponRedeemedOrderNumber")}:{" "}
                                        <span className="font-semibold text-amber-100">
                                          {redemptionOrder
                                            ? `#${redemptionOrder}`
                                            : `— (${t("admin.couponRedeemedOrderUnknown")})`}
                                        </span>
                                      </p>
                                    </div>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => deleteCoupon(c.code)}
                                  disabled={couponDeleteCode === c.code}
                                  className="rounded-lg border border-red-900/50 bg-red-950/20 px-2 py-1 text-[11px] text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {couponDeleteCode === c.code
                                    ? t("admin.deleting")
                                    : t("admin.couponDelete")}
                                </button>
                              </div>
                            </article>
                          );
                              })}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </section>
                ) : null}
              </>
            </div>

              <button
                type="button"
                onClick={() => setSiteVisitsPanelOpen((v) => !v)}
                aria-expanded={siteVisitsPanelOpen}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
              >
                <span className="min-w-0 flex-1 leading-snug">
                  {t("admin.siteVisitsTitle")}
                </span>
                <span
                  className="shrink-0 text-lg leading-none text-primary"
                  aria-hidden
                >
                  {siteVisitsPanelOpen ? "▾" : "▶"}
                </span>
              </button>
              {siteVisitsPanelOpen ? (
                <section
                  className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
                  aria-label={t("admin.siteVisitsTitle")}
                >
                  {typeof pwaInstallTotal === "number" ? (
                    <div className="mb-4 rounded-xl border border-primary/25 bg-slate-950/60 px-4 py-3">
                      <p className="text-xs font-semibold text-primary">
                        {t("admin.pwaInstallsTotalTitle")}
                      </p>
                      <p
                        className="mt-1 text-3xl font-bold tabular-nums text-gray-100"
                        aria-live="polite"
                      >
                        {pwaInstallTotal}
                      </p>
                      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                        {t("admin.pwaInstallsTotalHint")}
                      </p>
                    </div>
                  ) : null}
                  <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
                    {t("admin.siteVisitsHint")}
                  </p>
                  {siteVisitsErr === "redis" ? (
                    <p className="text-sm text-amber-200/90">
                      {t("admin.siteVisitsRedisHint")}
                    </p>
                  ) : siteVisitsErr === "load" ? (
                    <p className="text-sm text-gray-500">
                      {t("admin.siteVisitsLoadErr")}
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                      <table className="w-full min-w-[280px] border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-950/60">
                            <th className="px-3 py-2 font-semibold text-gray-300">
                              {t("admin.siteVisitsColDay")}
                            </th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-300">
                              {t("admin.siteVisitsColTotal")}
                            </th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-300">
                              {t("admin.siteVisitsColWeb")}
                            </th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-300">
                              {t("admin.siteVisitsColPwa")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {siteVisitsDays.map((row) => (
                            <tr
                              key={row.date}
                              className="border-b border-slate-800/60 last:border-0"
                            >
                              <td className="px-3 py-2 text-gray-200">
                                {formatDayHeading(row.date, locale)}
                              </td>
                              <td className="px-3 py-2 text-center font-semibold tabular-nums text-primary">
                                {row.total}
                              </td>
                              <td className="px-3 py-2 text-center tabular-nums text-gray-300">
                                {row.web}
                              </td>
                              <td className="px-3 py-2 text-center tabular-nums text-gray-300">
                                {row.pwa}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ) : null}

              <section
                className="mb-10 rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                aria-label={t("admin.salesCalendarTitle")}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-primary">
                    {t("admin.salesCalendarTitle")}
                  </h2>
                  <button
                    type="button"
                    onClick={goToToday}
                    className="rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-slate-800"
                  >
                    {t("admin.calendarTodayBtn")}
                  </button>
                </div>
                <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
                  {t("admin.salesCalendarHint")}
                </p>
                {orders.length === 0 ? (
                  <p className="mb-4 text-sm text-gray-500">{t("admin.empty")}</p>
                ) : null}

                <div
                  className="mb-6 flex items-center justify-between gap-2"
                  dir="ltr"
                >
                  <button
                    type="button"
                    onClick={() => shiftCalMonth(-1)}
                    aria-label={t("admin.calendarPrevMonth")}
                    className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-lg leading-none text-gray-200 transition-colors hover:border-primary/40 hover:bg-slate-800"
                  >
                    ‹
                  </button>
                  <span className="min-w-0 flex-1 text-center text-sm font-semibold text-gray-200">
                    {formatMonthYearTitle(vy, vm, locale)}
                  </span>
                  <button
                    type="button"
                    onClick={() => shiftCalMonth(1)}
                    aria-label={t("admin.calendarNextMonth")}
                    className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-lg leading-none text-gray-200 transition-colors hover:border-primary/40 hover:bg-slate-800"
                  >
                    ›
                  </button>
                </div>

                <div className="mb-4 rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2.5 text-sm">
                  <p className="text-gray-400">
                    {t("admin.monthSalesTotal")}{" "}
                    <span className="font-bold tabular-nums text-amber-400">
                      ₪{calendarMonthSalesTotals.food.toFixed(2)}
                    </span>
                  </p>
                  {calendarMonthSalesTotals.delivery > 0 ? (
                    <p className="mt-1 text-xs text-gray-500">
                      {t("admin.monthDeliveryFeesTotal")}{" "}
                      <span className="font-semibold tabular-nums text-gray-300">
                        ₪{calendarMonthSalesTotals.delivery.toFixed(2)}
                      </span>
                    </p>
                  ) : null}
                </div>

                <div className="mb-6" dir="ltr">
                  <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-500 sm:text-xs">
                    {weekdayLabels.map((label, i) => (
                      <div key={i} className="py-1">
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarCells.map((cellKey, idx) =>
                      cellKey == null ? (
                        <div key={`empty-${idx}`} className="aspect-square min-h-[2.25rem]" />
                      ) : (
                        (() => {
                          const isToday = cellKey === todayKey;
                          const isSel = selectedDayKey === cellKey;
                          const hasOrders = ordersByDay.has(cellKey);
                          const dayNum = parseDayKey(cellKey).d;
                          return (
                            <button
                              key={cellKey}
                              type="button"
                              onClick={() => setSelectedDayKey(cellKey)}
                              aria-pressed={isSel}
                              aria-label={cellKey}
                              className={`relative flex min-h-[2.25rem] aspect-square items-center justify-center rounded-lg border text-sm font-semibold transition-colors sm:min-h-[2.5rem] ${
                                isSel
                                  ? "border-primary bg-primary/20 text-primary"
                                  : "border-slate-700 bg-slate-950/50 text-gray-200 hover:border-slate-500 hover:bg-slate-800/60"
                              } ${
                                isToday
                                  ? "ring-1 ring-amber-500/60 ring-offset-1 ring-offset-slate-900/80"
                                  : ""
                              }`}
                            >
                              <span>{dayNum}</span>
                              {hasOrders ? (
                                <span
                                  className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-400"
                                  aria-hidden
                                />
                              ) : null}
                            </button>
                          );
                        })()
                      )
                    )}
                  </div>
                </div>

                {selectedDayKey ? (
                  <>
                    <h3 className="mb-2 border-b border-slate-800 pb-2 text-sm font-bold text-gray-300">
                      {formatDayHeading(selectedDayKey, locale)}
                      <span className="mr-2 text-xs font-normal text-gray-500">
                        ({selectedDayKey})
                      </span>
                    </h3>
                    <p className="mb-3 space-y-1 text-sm text-gray-400">
                      <span className="block">
                        {t("admin.daySalesTotal")}:{" "}
                        <span className="font-bold text-amber-400">
                          ₪{dayFoodSalesTotal(selectedDayOrders).toFixed(2)}
                        </span>
                        <span className="mr-2 text-xs text-gray-500">
                          ({selectedDayOrders.length}{" "}
                          {t("admin.ordersCount")})
                        </span>
                      </span>
                      {dayDeliveryFeesTotal(selectedDayOrders) > 0 ? (
                        <span className="block text-xs text-gray-500">
                          {t("admin.dayDeliveryFeesTotal")}:{" "}
                          <span className="font-semibold text-gray-300">
                            ₪
                            {dayDeliveryFeesTotal(selectedDayOrders).toFixed(2)}
                          </span>
                        </span>
                      ) : null}
                    </p>
                    {selectedDayOrders.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        {t("admin.dayOrdersEmpty")}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {selectedDayOrders.map((o) => (
                          <article
                            key={o.id}
                            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-sm"
                          >
                            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-primary">
                                  {o.customer?.name || "—"}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {o.customer?.phone}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-semibold text-primary">
                                  #{o.orderNumber ?? "—"}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatTime(o.createdAt, locale)}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {t("admin.payment")}:{" "}
                                  {t(`payment.${o.payment}`) || o.payment}
                                </p>
                                <div className="text-left sm:text-right">
                                  <p className="font-bold text-amber-400">
                                    <span className="text-[10px] font-normal text-gray-500">
                                      {t("admin.orderFoodAmountLabel")}{" "}
                                    </span>
                                    ₪{orderFoodSalesNis(o).toFixed(2)}
                                  </p>
                                  {orderDeliveryFeeNis(o) > 0 ? (
                                    <p className="text-[11px] font-semibold text-slate-300">
                                      <span className="font-normal text-gray-500">
                                        {t("admin.orderDeliveryAmountLabel")}{" "}
                                      </span>
                                      ₪
                                      {orderDeliveryFeeNis(o).toFixed(2)}
                                    </p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => deleteOrder(o.id)}
                                  disabled={deletingId !== null}
                                  className="mt-2 rounded-lg border border-red-900/50 bg-red-950/20 px-2 py-1 text-[11px] text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {deletingId === o.id
                                    ? t("admin.deleting")
                                    : t("admin.delete")}
                                </button>
                              </div>
                            </div>
                            {o.customer?.address ? (
                              <p className="mb-2 text-xs text-gray-500">
                                {o.customer.address}
                              </p>
                            ) : null}
                            {o.customer?.orderType === "delivery" &&
                            o.customer?.deliveryFeeNis != null ? (
                              <p className="mb-1 text-[11px] text-gray-400">
                                {t("checkout.deliveryFeeLine")}: ₪
                                {Number(o.customer.deliveryFeeNis).toFixed(0)}
                                {o.customer.deliveryDistanceKm != null
                                  ? ` · ${
                                      o.customer.deliveryRouteMode ===
                                      "air_fallback"
                                        ? t("checkout.distanceKm")
                                        : t("checkout.drivingDistanceKm")
                                    }: ${Number(
                                      o.customer.deliveryDistanceKm
                                    ).toFixed(1)} km`
                                  : ""}
                                {o.customer.deliveryPayTo === "restaurant_all"
                                  ? ` · ${t("checkout.payRestaurantAll")}`
                                  : o.customer.deliveryPayTo ===
                                      "courier_delivery"
                                    ? ` · ${payCourierDeliverySplitLabel(
                                        t,
                                        o.payment
                                      )}`
                                    : o.customer.deliveryPayTo ===
                                        "courier_all_cash"
                                      ? ` · ${t("checkout.payCourierCashFull")}`
                                      : ""}
                              </p>
                            ) : null}
                            {Number(o.customer?.discountAmountNis) > 0 ? (
                              <p className="mb-1 text-[11px] text-emerald-300/90">
                                {t("wa.discount")}: -₪
                                {Number(o.customer.discountAmountNis).toFixed(2)}
                              </p>
                            ) : null}
                            {Number(o.customer?.couponDiscountNis) > 0 ? (
                              <p className="mb-1 text-[11px] text-cyan-300/90">
                                {t("wa.coupon")}
                                {o.customer?.couponCode
                                  ? ` (${String(o.customer.couponCode).toUpperCase()})`
                                  : ""}
                                : -₪{Number(o.customer.couponDiscountNis).toFixed(2)}
                              </p>
                            ) : null}
                            <ul className="space-y-2 border-t border-slate-800 pt-2 text-xs text-gray-300">
                              {getCartItemsInWhatsAppOrder(
                                o.items,
                                locale
                              ).map((entry, waIdx) => {
                                if (entry.type === "header") {
                                  return (
                                    <li
                                      key={`${o.id}-wa-h-${waIdx}`}
                                      className="list-none py-1"
                                    >
                                      <p className="text-[11px] font-bold text-primary/95">
                                        {entry.label}
                                      </p>
                                    </li>
                                  );
                                }
                                const it = entry.item;
                                const displayIndex = entry.displayIndex;
                                const qty = Number(it.quantity) || 1;
                                const lineTotal = (
                                  Number(it.price) * qty
                                ).toFixed(2);
                                return (
                                  <li
                                    key={
                                      it.id ||
                                      `${o.id}-wa-${displayIndex}-${it.name}-${it.price}`
                                    }
                                    className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-2"
                                  >
                                    <p className="text-[13px] font-semibold text-gray-100">
                                      <span className="text-primary">
                                        {displayIndex}.
                                      </span>{" "}
                                      {it.name}
                                      {qty > 1 ? ` ×${qty}` : ""}
                                      {" — "}₪{lineTotal}
                                    </p>
                                    {it.sizeLabel ? (
                                      <p className="mt-1 text-[11px] text-gray-400">
                                        {t("checkout.size")}: {it.sizeLabel}
                                      </p>
                                    ) : null}
                                    {it.variantLabel ? (
                                      <p className="text-[11px] text-gray-400">
                                        {t("checkout.variant")}:{" "}
                                        {it.variantLabel}
                                      </p>
                                    ) : null}
                                    {it.salads?.length ? (
                                      <p className="text-[11px] text-gray-400">
                                        {t("checkout.saladsPrefix")}:{" "}
                                        {sortSaladsForDisplay(it.salads)
                                          .map((x) => x.label)
                                          .join(", ")}
                                      </p>
                                    ) : null}
                                    {(() => {
                                      const pid = cartLineProductId(it);
                                      const mealDesc =
                                        specialBurgerMenuDescription(
                                          locale,
                                          pid
                                        );
                                      if (!mealDesc) return null;
                                      return (
                                        <p className="text-[11px] text-gray-400">
                                          {t(
                                            "checkout.specialMealComponentsPrefix"
                                          )}
                                          : {mealDesc}
                                        </p>
                                      );
                                    })()}
                                    {typeof it.bunSauceOnBun === "boolean" ? (
                                      <p className="text-[11px] text-gray-400">
                                        {t("checkout.bunSauceOnBunPrefix")}:{" "}
                                        {it.bunSauceOnBun
                                          ? t("ui.bunSauceYes")
                                          : t("ui.bunSauceNo")}
                                      </p>
                                    ) : null}
                                    {it.burgerDoneness?.label ? (
                                      <p className="text-[11px] text-gray-400">
                                        {t("checkout.donenessPrefix")}:{" "}
                                        {it.burgerDoneness.label}
                                      </p>
                                    ) : null}
                                    {it.toppings?.length ? (
                                      <p className="text-[11px] text-gray-400">
                                        {t("checkout.toppingsPrefix")}:{" "}
                                        {it.toppings
                                          .map((x) => x.label)
                                          .join(", ")}
                                      </p>
                                    ) : null}
                                    {it.extras?.length ? (
                                      <p className="text-[11px] text-gray-400">
                                        {t("checkout.extrasPrefix")}:{" "}
                                        {it.extras
                                          .map((x) => x.label)
                                          .join(", ")}
                                      </p>
                                    ) : null}
                                    {it.requestedDrinkLabel ? (
                                      <p className="text-[11px] text-sky-200/90">
                                        {t("wa.drink")}:{" "}
                                        {it.requestedDrinkLabel}
                                        {Number.isFinite(
                                          Number(it.requestedDrinkPrice)
                                        )
                                          ? ` (+₪${Number(
                                              it.requestedDrinkPrice
                                            ).toFixed(0)})`
                                          : ""}
                                      </p>
                                    ) : null}
                                    {it.sellerNotes ? (
                                      <p className="text-[11px] text-amber-200/90">
                                        {t("ui.sellerNotes")}: {it.sellerNotes}
                                      </p>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                            {(() => {
                              const prep = aggregatePattyCountsFromOrderItems(
                                o.items || []
                              );
                              if (!hasAnyPattyPrep(prep)) return null;
                              return (
                                <div className="mt-2 rounded-lg border border-amber-800/50 bg-amber-950/25 p-2 text-[11px] leading-relaxed text-amber-100/95">
                                  <p className="mb-1 font-semibold text-amber-200">
                                    {t("admin.pattyPrepTitle")}
                                  </p>
                                  <ul className="list-inside list-disc space-y-0.5 text-gray-200">
                                    {PATTY_GRAMS_ORDER.map((g) => {
                                      const n = prep.counts[g] || 0;
                                      if (n <= 0) return null;
                                      return (
                                        <li key={g}>
                                          {t("admin.pattyPrepLine")
                                            .replace("{n}", String(n))
                                            .replace("{g}", String(g))}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                  {prep.qty600 > 0 ? (
                                    <p className="mt-1.5 border-t border-amber-800/40 pt-1.5 text-[10px] text-amber-200/90">
                                      {t("admin.pattyPrep600Note").replace(
                                        "{n}",
                                        String(prep.qty600)
                                      )}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })()}
                            <p className="mt-2 text-[10px] text-gray-600">
                              {t("admin.orderId")}: {o.id}
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                ) : null}
              </section>
            </>
          ) : null}
        </main>
        {catalogModal ? (
          <div
            className="fixed inset-0 z-[300] flex items-end justify-center bg-black/80 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-modal-title"
          >
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-xl">
              <h3
                id="catalog-modal-title"
                className="mb-3 text-sm font-bold text-primary"
              >
                {catalogModal.kind === "add"
                  ? t("admin.catalogModalAdd")
                  : t("admin.catalogModalEdit")}
              </h3>
              <p className="mb-3 text-[10px] text-gray-500">
                {t("admin.catalogSlugHint")}
              </p>
              <div className="flex flex-col gap-2 text-xs">
                <label className="flex flex-col gap-1 text-gray-400">
                  <span>{t("admin.catalogId")}</span>
                  <input
                    value={catalogModal.draft.id}
                    disabled={
                      catalogModal.kind === "edit" || catalogSaving
                    }
                    onChange={(e) =>
                      setCatalogModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              draft: { ...prev.draft, id: e.target.value },
                            }
                          : null
                      )
                    }
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-gray-100 disabled:opacity-60"
                  />
                </label>
                <label className="flex flex-col gap-1 text-gray-400">
                  <span>{t("admin.catalogCategory")}</span>
                  <select
                    value={catalogModal.draft.category}
                    disabled={catalogSaving}
                    onChange={(e) =>
                      setCatalogModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              draft: {
                                ...prev.draft,
                                category: e.target.value,
                              },
                            }
                          : null
                      )
                    }
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-gray-100"
                  >
                    {CATALOG_CATEGORIES.map((cid) => (
                      <option key={cid} value={cid}>
                        {t(`cat.${cid}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-gray-400">
                  <span>{t("admin.catalogPrice")}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={catalogModal.draft.basePrice}
                    disabled={catalogSaving}
                    onChange={(e) =>
                      setCatalogModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              draft: {
                                ...prev.draft,
                                basePrice: e.target.value,
                              },
                            }
                          : null
                      )
                    }
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-gray-100"
                  />
                </label>
                <div className="flex flex-col gap-2 text-gray-400">
                  <span className="text-xs">{t("admin.catalogImage")}</span>
                  <p className="text-[10px] leading-snug text-gray-500">
                    {t("admin.catalogImageUrlHint")}
                  </p>
                  <input
                    ref={catalogImageFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={catalogSaving || catalogImageUploading}
                    className="max-w-full text-[11px] text-gray-400 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-2 file:py-1.5 file:text-gray-200 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={uploadCatalogMenuImage}
                    disabled={
                      catalogSaving ||
                      catalogImageUploading ||
                      !secret.trim()
                    }
                    className="w-fit rounded-lg border border-primary/50 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-slate-800 disabled:opacity-50"
                  >
                    {catalogImageUploading
                      ? t("admin.catalogImageUploading")
                      : t("admin.catalogUploadBtn")}
                  </button>
                  {catalogModal.draft.image ? (
                    <div className="mt-1">
                      <img
                        src={catalogModal.draft.image}
                        alt=""
                        className="max-h-24 max-w-full rounded-lg border border-slate-700 object-contain"
                      />
                    </div>
                  ) : null}
                </div>
                <label className="flex flex-col gap-1 text-gray-400">
                  <span>{t("admin.catalogNameHe")}</span>
                  <input
                    value={catalogModal.draft.nameHe}
                    disabled={catalogSaving}
                    onChange={(e) =>
                      setCatalogModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              draft: {
                                ...prev.draft,
                                nameHe: e.target.value,
                              },
                            }
                          : null
                      )
                    }
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-gray-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-gray-400">
                  <span>{t("admin.catalogNameAr")}</span>
                  <input
                    value={catalogModal.draft.nameAr}
                    disabled={catalogSaving}
                    onChange={(e) =>
                      setCatalogModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              draft: {
                                ...prev.draft,
                                nameAr: e.target.value,
                              },
                            }
                          : null
                      )
                    }
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-gray-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-gray-400">
                  <span>{t("admin.catalogDescHe")}</span>
                  <input
                    value={catalogModal.draft.descHe}
                    disabled={catalogSaving}
                    onChange={(e) =>
                      setCatalogModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              draft: {
                                ...prev.draft,
                                descHe: e.target.value,
                              },
                            }
                          : null
                      )
                    }
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-gray-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-gray-400">
                  <span>{t("admin.catalogDescAr")}</span>
                  <input
                    value={catalogModal.draft.descAr}
                    disabled={catalogSaving}
                    onChange={(e) =>
                      setCatalogModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              draft: {
                                ...prev.draft,
                                descAr: e.target.value,
                              },
                            }
                          : null
                      )
                    }
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-gray-100"
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={catalogSaving || catalogImageUploading}
                  onClick={() => {
                    if (catalogImageFileRef.current) {
                      catalogImageFileRef.current.value = "";
                    }
                    setCatalogModal(null);
                  }}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-slate-900 disabled:opacity-50"
                >
                  {t("admin.catalogCancel")}
                </button>
                <button
                  type="button"
                  disabled={
                    catalogSaving ||
                    catalogImageUploading ||
                    !secret.trim()
                  }
                  onClick={submitCatalogModal}
                  className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50"
                >
                  {t("admin.catalogSaveRow")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {loaded && mergedCatalogItems.length > 0 ? (
        <AdminMenuExportSheet
          ref={menuExportRef}
          items={mergedCatalogItems}
          t={t}
          locale={locale}
        />
      ) : null}
    </>
  );
}
