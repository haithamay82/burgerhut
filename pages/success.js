import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { useLocale } from "@/contexts/LocaleContext";
import { buildWhatsAppUrl } from "@/utils/whatsapp";
import {
  BIT_DEFERRED_COUPON_CLAIM_KEY,
  buildSuccessPageMatchKey,
  clearCardSuccessSnapshot,
  hasValidCardSuccessSnapshot,
  PENDING_ORDER_KEY,
  readCardSuccessSnapshotRaw,
  readSuccessWaRestoreRaw,
  SUCCESS_WA_SENT_KEY,
  SUCCESS_WA_SNAPSHOT_KEY,
  writeSuccessWaRestore,
} from "@/utils/checkoutSessionKeys";
import {
  fireCouponRevealAfterWhatsAppCompose,
  fireDeferredAdminPushNotify,
} from "@/utils/fireDeferredAdminPushNotify";
import { MIN_COUPON_DISPLAY_VALUE_NIS } from "@/lib/coupon";
import {
  computeInvoiceDeliveryPrefs,
  readHypCallbackQueryFromHref,
} from "@/lib/hypPayProtocol";

function deferredCouponClaimStorageKey(orderNumber, code) {
  return `bh_deferred_coupon_claimed_${String(orderNumber)}_${String(code)}`;
}

function firstQuery(router, key) {
  const v = router.query?.[key];
  return Array.isArray(v) ? v[0] : v;
}

/** צריכת קופון דחויה (ביט/אשראי) אחרי השלמת תשלום — פעם אחת לכל צמד הזמנה+קוד */
async function maybeClaimDeferredCouponClient(orderNumber, couponCode) {
  if (typeof window === "undefined") return;
  const on =
    orderNumber !== undefined &&
    orderNumber !== null &&
    String(orderNumber).trim() !== ""
      ? String(orderNumber).trim()
      : "";
  const code = String(couponCode || "").trim().toUpperCase();
  if (!on || !code) return;
  const sk = deferredCouponClaimStorageKey(on, code);
  try {
    if (window.sessionStorage.getItem(sk)) return;
  } catch {
    /* ignore */
  }
  try {
    const r = await fetch("/api/coupon/complete-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: on, code }),
    });
    if (r.ok) {
      try {
        window.sessionStorage.setItem(sk, "1");
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/** בסיס אחוז לקופון חדש: מזון בלי משלוח (אם קיים בשמירה); אחרת סכום ההזמנה המלא כבעבר */
function couponCreateAmountFromCardOrder(cardOrder) {
  if (!cardOrder) return 0;
  const br = Number(cardOrder.couponRewardBaseNis);
  if (Number.isFinite(br) && br >= 0) return br;
  return Number(cardOrder.amount) || 0;
}

export default function SuccessPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const method = firstQuery(router, "method") || "";
  const orderFromQuery = Array.isArray(router.query.on)
    ? router.query.on[0]
    : router.query.on;
  /** Hyp מחזיר לעיתים uniqueId / txId — חייבים לזהות כדי לטעון snapshot ולהציג ווטסאפ */
  const hypReturn =
    firstQuery(router, "uniqueID") ||
    firstQuery(router, "uniqueid") ||
    firstQuery(router, "uniqueId") ||
    firstQuery(router, "txId") ||
    firstQuery(router, "cgUid") ||
    firstQuery(router, "Id");
  /** חלק מההגדרות ב-Hyp מחזירות מזהים ב-hash של ה-URL — Next query לא תופס */
  const [hypFromHash, setHypFromHash] = useState("");
  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    const hash = (window.location.hash || "").replace(/^#/, "");
    if (!hash.includes("=")) {
      setHypFromHash("");
      return;
    }
    const qs = hash.startsWith("?") ? hash.slice(1) : hash;
    try {
      const p = new URLSearchParams(qs);
      const h =
        p.get("uniqueId") ||
        p.get("uniqueID") ||
        p.get("txId") ||
        p.get("cgUid") ||
        p.get("Id") ||
        "";
      setHypFromHash(String(h || ""));
    } catch {
      setHypFromHash("");
    }
  }, [router.isReady, router.asPath]);

  const payDoneMarker = String(hypReturn || hypFromHash || "");

  const [cardWaUrl, setCardWaUrl] = useState("");
  const [cardOrder, setCardOrder] = useState(null);
  const [coupon, setCoupon] = useState(null);
  /** אחרי ניסיון טעינת קופון (או מטמון) — מאפשר ווטסאפ גם אם לא נוצר קופון */
  const [couponFetchSettled, setCouponFetchSettled] = useState(false);
  /**
   * null = טוען; true = מנהל הפעיל קופונים ללקוחות (כמו ב־/api/coupon/create);
   * false = קופונים כבויים או אחוז 0 — כפתור ווטסאפ פעיל מיד בלי להמתין לקופון
   */
  const [customerCouponsActive, setCustomerCouponsActive] = useState(null);
  const [waComposeAlreadyUsed, setWaComposeAlreadyUsed] = useState(false);
  /** תאימות לאחור: סשן ישן עם deferAdminPush + סוד אישור */
  const [waAdminPushPayload, setWaAdminPushPayload] = useState(null);

  /** אשראי: שחרור הזמנה לניהול פעם אחת רק אחרי Hyp CCode=0 */
  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    if (!payDoneMarker) return;
    const hypQ = readHypCallbackQueryFromHref(window.location.href);
    if (String(hypQ.CCode ?? hypQ.ccode ?? "").trim() !== "0") return;

    let raw;
    try {
      raw = readCardSuccessSnapshotRaw();
    } catch {
      return;
    }
    if (!raw) return;
    let snap;
    try {
      snap = JSON.parse(raw);
    } catch {
      return;
    }
    if (String(snap?.payment || "") !== "card") return;
    const orderRowId =
      snap.orderRowId != null && String(snap.orderRowId).trim() !== ""
        ? String(snap.orderRowId).trim()
        : "";
    const onRaw = snap.orderNumber;
    const orderNumber =
      onRaw != null && String(onRaw).trim() !== ""
        ? String(onRaw).trim()
        : "";
    const adminPushConfirmSecret = String(
      snap.adminPushConfirmSecret || ""
    ).trim();
    if (!orderRowId || !orderNumber || !adminPushConfirmSecret) return;

    const firedKey = `bh_card_admin_released_${orderRowId}`;
    try {
      if (window.sessionStorage.getItem(firedKey)) return;
    } catch {
      return;
    }

    fireDeferredAdminPushNotify({
      orderRowId,
      orderNumber,
      adminPushConfirmSecret,
    });
    try {
      window.sessionStorage.setItem(firedKey, "1");
    } catch {
      /* ignore */
    }
  }, [router.isReady, router.asPath, payDoneMarker]);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    if (payDoneMarker) {
      try {
        window.sessionStorage.removeItem(PENDING_ORDER_KEY);
      } catch {
        /* ignore */
      }
    }
    const allowSnapshotLoad =
      Boolean(payDoneMarker) ||
      method === "card" ||
      method === "cash" ||
      hasValidCardSuccessSnapshot();
    if (!allowSnapshotLoad) {
      setWaAdminPushPayload(null);
      return;
    }

    const methodStr = String(method || "");

    const buildMatchKey = () =>
      buildSuccessPageMatchKey({
        method: methodStr,
        orderOn: orderFromQuery,
        hypReturn: payDoneMarker,
      });

    const RESTORE_MAX_AGE_MS = 48 * 3600 * 1000;

    try {
      const rawRestore = readSuccessWaRestoreRaw();
      if (rawRestore) {
        const restored = JSON.parse(rawRestore);
        const age = Date.now() - Number(restored?.savedAt || 0);
        if (
          restored?.waUrl &&
          restored?.matchKey === buildMatchKey() &&
          age >= 0 &&
          age <= RESTORE_MAX_AGE_MS
        ) {
          setCardWaUrl(restored.waUrl);
          if (
            restored.cardOrder?.orderId != null &&
            (restored.cardOrder?.amount != null ||
              restored.cardOrder?.couponRewardBaseNis != null)
          ) {
            const co = {
              orderId: String(restored.cardOrder.orderId),
              amount: Number(restored.cardOrder.amount) || 0,
            };
            if (
              restored.cardOrder.orderNumber != null &&
              String(restored.cardOrder.orderNumber).trim() !== ""
            ) {
              co.orderNumber = restored.cardOrder.orderNumber;
            }
            const rb = restored.cardOrder.couponRewardBaseNis;
            if (
              rb != null &&
              Number.isFinite(Number(rb)) &&
              Number(rb) >= 0
            ) {
              co.couponRewardBaseNis = Number(rb);
            }
            setCardOrder(co);
          }
          if (
            payDoneMarker &&
            restored.deferredCouponCode &&
            restored.deferredCouponClaimOrderNumber != null &&
            String(restored.deferredCouponClaimOrderNumber).trim() !== ""
          ) {
            void maybeClaimDeferredCouponClient(
              restored.deferredCouponClaimOrderNumber,
              restored.deferredCouponCode
            );
          }
          if (
            restored.adminPushOrderRowId &&
            restored.adminPushConfirmSecret
          ) {
            const onum =
              restored.adminPushOrderNumber != null &&
              String(restored.adminPushOrderNumber).trim() !== ""
                ? String(restored.adminPushOrderNumber)
                : orderFromQuery != null && String(orderFromQuery).trim() !== ""
                  ? String(orderFromQuery)
                  : "";
            if (onum) {
              setWaAdminPushPayload({
                orderRowId: String(restored.adminPushOrderRowId),
                orderNumber: onum,
                adminPushConfirmSecret: String(restored.adminPushConfirmSecret),
              });
            } else {
              setWaAdminPushPayload(null);
            }
          } else {
            setWaAdminPushPayload(null);
          }
          return;
        }
      }
    } catch {
      /* fall through to snapshot */
    }

    try {
      let raw;
      if (methodStr === "cash") {
        raw = window.sessionStorage.getItem(SUCCESS_WA_SNAPSHOT_KEY);
      } else {
        raw = readCardSuccessSnapshotRaw();
      }
      if (!raw) return;
      const snap = JSON.parse(raw);
      if (!snap?.customer || !Array.isArray(snap.items) || !snap.items.length) {
        return;
      }
      const url = buildWhatsAppUrl({
        customer: snap.customer,
        cart: { items: snap.items },
        total: Number(snap.waGrandTotal) || 0,
        payment: snap.payment || "card",
        orderNumber: snap.orderNumber ?? orderFromQuery,
        locale: snap.locale || locale,
      });
      const amountFromSnap = Number(snap.waGrandTotal);
      const amountFromItems = (snap.items || []).reduce(
        (sum, item) =>
          sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 1),
        0
      );
      const grand =
        (Number.isFinite(amountFromSnap) && amountFromSnap > 0
          ? amountFromSnap
          : amountFromItems) || 0;
      const snapOrderNum =
        snap.orderNumber != null && String(snap.orderNumber).trim() !== ""
          ? snap.orderNumber
          : orderFromQuery != null && String(orderFromQuery).trim() !== ""
            ? orderFromQuery
            : null;
      const nextCardOrder = {
        orderId: String(
          snap.orderRowId ??
            snap.cardUniqueId ??
            snap.orderNumber ??
            orderFromQuery ??
            payDoneMarker ??
            ""
        ),
        amount: grand,
      };
      if (snapOrderNum != null) {
        nextCardOrder.orderNumber = snapOrderNum;
      }
      const rbSnap = snap.couponRewardBaseNis;
      if (
        rbSnap !== undefined &&
        rbSnap !== null &&
        Number.isFinite(Number(rbSnap)) &&
        Number(rbSnap) >= 0
      ) {
        nextCardOrder.couponRewardBaseNis = Number(rbSnap);
      }
      setCardWaUrl(url);
      setCardOrder(nextCardOrder);
      if (snap.orderRowId && snap.adminPushConfirmSecret) {
        const onum =
          snapOrderNum != null && String(snapOrderNum).trim() !== ""
            ? String(snapOrderNum)
            : orderFromQuery != null && String(orderFromQuery).trim() !== ""
              ? String(orderFromQuery)
              : "";
        if (onum) {
          setWaAdminPushPayload({
            orderRowId: String(snap.orderRowId),
            orderNumber: onum,
            adminPushConfirmSecret: String(snap.adminPushConfirmSecret),
          });
        } else {
          setWaAdminPushPayload(null);
        }
      } else {
        setWaAdminPushPayload(null);
      }
      if (
        payDoneMarker &&
        snap.orderNumber != null &&
        String(snap.orderNumber).trim() !== "" &&
        String(snap.customer?.couponCode || "").trim()
      ) {
        void maybeClaimDeferredCouponClient(
          snap.orderNumber,
          snap.customer.couponCode
        );
      }
      try {
        const deferredCouponCode = String(snap.customer?.couponCode || "")
          .trim()
          .toUpperCase();
        writeSuccessWaRestore({
          matchKey: buildMatchKey(),
          waUrl: url,
          cardOrder: nextCardOrder,
          savedAt: Date.now(),
          deferredCouponClaimOrderNumber:
            snap.orderNumber != null &&
            String(snap.orderNumber).trim() !== ""
              ? snap.orderNumber
              : null,
          deferredCouponCode: deferredCouponCode || undefined,
          adminPushOrderRowId: snap.orderRowId,
          adminPushOrderNumber: snapOrderNum ?? undefined,
          adminPushConfirmSecret: snap.adminPushConfirmSecret,
        });
        if (methodStr === "cash") {
          try {
            window.sessionStorage.removeItem(SUCCESS_WA_SNAPSHOT_KEY);
          } catch {
            /* ignore */
          }
        } else {
          clearCardSuccessSnapshot();
        }
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  }, [router.isReady, payDoneMarker, method, locale, orderFromQuery]);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    if (String(method || "") !== "bit") return;

    let cancelled = false;
    (async () => {
      try {
        const raw = window.sessionStorage.getItem(BIT_DEFERRED_COUPON_CLAIM_KEY);
        if (!raw) return;
        let p;
        try {
          p = JSON.parse(raw);
        } catch {
          return;
        }
        if (
          !p?.couponCode ||
          p.orderNumber == null ||
          String(p.orderNumber).trim() === ""
        ) {
          return;
        }
        await maybeClaimDeferredCouponClient(p.orderNumber, p.couponCode);
        if (cancelled) return;
        const sk = deferredCouponClaimStorageKey(p.orderNumber, p.couponCode);
        try {
          if (window.sessionStorage.getItem(sk)) {
            window.sessionStorage.removeItem(BIT_DEFERRED_COUPON_CLAIM_KEY);
          }
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, method]);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    const waAuxFlow =
      Boolean(payDoneMarker) ||
      method === "card" ||
      method === "cash" ||
      Boolean(cardWaUrl) ||
      hasValidCardSuccessSnapshot();
    if (!waAuxFlow) return;
    const mk = buildSuccessPageMatchKey({
      method,
      orderOn: orderFromQuery,
      hypReturn: payDoneMarker,
    });
    const RESTORE_MAX_AGE_MS = 48 * 3600 * 1000;
    let used = false;
    try {
      const rawSent = window.sessionStorage.getItem(SUCCESS_WA_SENT_KEY);
      if (rawSent) {
        const sent = JSON.parse(rawSent);
        const age = Date.now() - Number(sent?.savedAt || 0);
        if (
          sent?.matchKey === mk &&
          age >= 0 &&
          age <= RESTORE_MAX_AGE_MS
        ) {
          used = true;
        }
      }
    } catch {
      /* ignore */
    }
    setWaComposeAlreadyUsed(used);
  }, [router.isReady, payDoneMarker, method, orderFromQuery, cardWaUrl]);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    const waAuxFlow =
      Boolean(payDoneMarker) ||
      method === "card" ||
      method === "cash" ||
      Boolean(cardWaUrl) ||
      hasValidCardSuccessSnapshot();
    if (!waAuxFlow) {
      setCustomerCouponsActive(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/discount");
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        const offered =
          Boolean(d?.couponEnabled) && Number(d?.couponPercent) > 0;
        setCustomerCouponsActive(offered);
      } catch {
        if (!cancelled) setCustomerCouponsActive(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, payDoneMarker, method, cardWaUrl]);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    const waAuxFlow =
      Boolean(payDoneMarker) ||
      method === "card" ||
      method === "cash" ||
      Boolean(cardWaUrl) ||
      hasValidCardSuccessSnapshot();
    if (!waAuxFlow) {
      setCouponFetchSettled(true);
      return;
    }
    if (customerCouponsActive === false) {
      setCouponFetchSettled(true);
      return;
    }
    if (customerCouponsActive !== true) {
      return;
    }
    const couponCreateAmount = couponCreateAmountFromCardOrder(cardOrder);
    if (!cardOrder?.orderId || couponCreateAmount <= 0) {
      setCouponFetchSettled(true);
      return;
    }

    const sessionKey = `bh_coupon_created_${cardOrder.orderId}`;
    try {
      const cached = window.sessionStorage.getItem(sessionKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.code) {
          const cv = Number(parsed.value);
          if (
            Number.isFinite(cv) &&
            cv >= MIN_COUPON_DISPLAY_VALUE_NIS
          ) {
            setCoupon(parsed);
            setCouponFetchSettled(true);
            return;
          }
          try {
            window.sessionStorage.removeItem(sessionKey);
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }

    setCouponFetchSettled(false);
    let active = true;
    (async () => {
      try {
        const r = await fetch("/api/coupon/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: cardOrder.orderId,
            orderNumber: cardOrder.orderNumber,
            amount: couponCreateAmount,
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (active && r.ok && d?.ok) {
          if (d.enabled === false) {
            setCustomerCouponsActive(false);
          }
          if (d?.coupon?.code) {
            const cv = Number(d.coupon.value);
            if (
              Number.isFinite(cv) &&
              cv >= MIN_COUPON_DISPLAY_VALUE_NIS
            ) {
              setCoupon(d.coupon);
              try {
                window.sessionStorage.setItem(
                  sessionKey,
                  JSON.stringify(d.coupon)
                );
              } catch {
                /* ignore */
              }
            }
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setCouponFetchSettled(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [router.isReady, payDoneMarker, method, cardOrder, customerCouponsActive]);

  const cardInvoiceNotice = useMemo(() => {
    if (!payDoneMarker || method !== "card" || typeof window === "undefined") {
      return null;
    }
    const p = readHypCallbackQueryFromHref(window.location.href);
    const ccode = String(p.CCode ?? p.ccode ?? "").trim();
    if (ccode !== "0") return null;
    let inv = null;
    try {
      const raw = readCardSuccessSnapshotRaw();
      if (!raw) return null;
      const snap = JSON.parse(raw);
      inv =
        snap.invoiceDelivery ||
        computeInvoiceDeliveryPrefs({
          email: snap.customer?.email,
          phone: snap.customer?.phone,
        });
    } catch {
      return null;
    }
    if (!inv) return null;

    const infoCls =
      "mb-4 max-w-md rounded-xl border border-sky-700/50 bg-sky-950/40 px-4 py-3 text-center text-sm leading-snug text-sky-100/95";
    const warnCls =
      "mb-4 max-w-md rounded-xl border border-amber-700/50 bg-amber-950/35 px-4 py-3 text-center text-sm leading-snug text-amber-50/95";

    if (!inv.sendEmailInvoice && !inv.sendSmsInvoice) {
      return {
        text: t("success.invoiceCheckoutHintNoChannel"),
        className: warnCls,
      };
    }
    const heshRaw = p.Hesh ?? p.hesh;
    const heshNum = Number(heshRaw);
    const heshOk = Number.isFinite(heshNum) && heshNum !== 0;
    if (!heshOk) {
      return {
        text: t("success.invoiceHypNoReceipt"),
        className: warnCls,
      };
    }
    if (inv.sendEmailInvoice && inv.sendSmsInvoice) {
      return {
        text: t("success.invoiceSentEmailAndSms"),
        className: infoCls,
      };
    }
    if (inv.sendEmailInvoice) {
      return { text: t("success.invoiceSentEmailOnly"), className: infoCls };
    }
    return { text: t("success.invoiceSentSmsOnly"), className: infoCls };
  }, [payDoneMarker, method, t, router.asPath]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "development") return;
    if (!payDoneMarker || method !== "card") return;
    const p = readHypCallbackQueryFromHref(window.location.href);
    if (String(p.CCode ?? p.ccode ?? "").trim() !== "0") return;
    let inv = null;
    try {
      const raw = readCardSuccessSnapshotRaw();
      if (!raw) return;
      const snap = JSON.parse(raw);
      inv =
        snap.invoiceDelivery ||
        computeInvoiceDeliveryPrefs({
          email: snap.customer?.email,
          phone: snap.customer?.phone,
        });
    } catch {
      return;
    }
    if (!inv?.sendEmailInvoice && !inv?.sendSmsInvoice) return;
    const heshRaw = p.Hesh ?? p.hesh;
    const heshNum = Number(heshRaw);
    if (!Number.isFinite(heshNum) || heshNum === 0) {
      console.warn(
        "[success][dev] Invoice was requested (email/SMS) but Hesh is missing or 0 — check terminal invoice module and SMS package."
      );
    }
  }, [payDoneMarker, method, router.asPath]);

  const title = payDoneMarker
    ? t("success.paymentCompleted")
    : method === "online"
      ? t("success.titleOnline")
      : method === "cash" || method === "bit"
        ? t("success.titleOk")
        : method === "card"
          ? t("success.paymentCompleted")
          : t("success.titleOk");

  const description = payDoneMarker
    ? t("success.paymentCompletedSub")
    : method === "online"
      ? t("success.descOnline")
      : method === "bit"
        ? t("success.descBit")
        : method === "card"
          ? t("success.descCard")
          : method === "cash"
            ? t("success.descCash")
            : t("success.descCard");

  const formatCouponDate = (ts) => {
    const d = new Date(Number(ts) || Date.now());
    const intlLocale = locale === "ar" ? "ar-EG" : "he-IL";
    return new Intl.DateTimeFormat(intlLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(d);
  };

  const postPaymentWhatsAppContext =
    Boolean(payDoneMarker) ||
    method === "card" ||
    method === "cash" ||
    (Boolean(cardWaUrl) && Boolean(cardOrder));

  /** כפתור ווטסאפ רק אחרי שהקופון הוצג (כשמסלול הקופון פעיל), או מיד כשקופונים כבויים */
  const couponCreateAmtBtn = couponCreateAmountFromCardOrder(cardOrder);
  const cannotCreateCouponBtn =
    !cardOrder?.orderId || couponCreateAmtBtn <= 0;
  /** יצירת קופון הסתיימה בלי קוד (למשל סכום מתחת ל־MIN) — עוברים ישר לווטסאפ */
  const couponSkippedOrNone =
    customerCouponsActive === true &&
    couponFetchSettled &&
    !coupon?.code &&
    Boolean(cardOrder?.orderId) &&
    couponCreateAmtBtn > 0;
  const couponReadyForWaButton =
    customerCouponsActive === false
      ? couponFetchSettled
      : customerCouponsActive === true
        ? Boolean(coupon?.code) ||
          (couponFetchSettled && cannotCreateCouponBtn) ||
          couponSkippedOrNone
        : false;

  const showMergedWaButton =
    postPaymentWhatsAppContext &&
    cardWaUrl &&
    !waComposeAlreadyUsed &&
    couponReadyForWaButton;

  /** מסך כפתור ווטסאפ אחרי אשראי מאושר (כולל חזרה מ־Hyp עם מזהה בעמוד) */
  const showCardWaHeadlineCopy =
    showMergedWaButton &&
    (method === "card" || Boolean(payDoneMarker));

  /**
   * לא להציג ✓/«התקבלה» בזמן המתנה לקופון ולווטסאפ (אשראי/מזומן/חזרה מ-Hyp).
   * ביט בלי קישור wa בדף — ממשיכים להציג הצלחה רגילה.
   */
  const mayStillNeedWaComposer =
    Boolean(cardWaUrl) ||
    method === "card" ||
    method === "cash" ||
    Boolean(payDoneMarker);
  const hideSuccessCheckUntilWaSent =
    postPaymentWhatsAppContext &&
    !waComposeAlreadyUsed &&
    mayStillNeedWaComposer;
  const showSuccessCheckBlock =
    !hideSuccessCheckUntilWaSent && !showMergedWaButton;

  const waSendClasses =
    "btn-primary flex w-full justify-center px-4 py-3 text-center text-base font-extrabold text-black shadow-[0_0_0_3px_rgba(251,191,36,0.4)] ring-2 ring-amber-400/90";

  return (
    <Layout>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        {postPaymentWhatsAppContext && coupon?.code ? (
          <section className="mb-4 w-full max-w-sm rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-900 via-slate-950 to-cyan-950 p-4 text-right text-white shadow-lg shadow-emerald-900/20">
            <div className="relative rounded-xl border border-white/10 bg-slate-950/70 p-3 pt-10">
              <img
                src="/logo-burger-hut.png"
                alt="Burger Hut"
                width={36}
                height={36}
                className="absolute left-3 top-3 h-9 w-9 rounded-full border border-white/30 bg-white/95 p-0.5 object-cover"
              />
              <div
                className="mt-1 flex flex-row items-center gap-2.5 sm:gap-4"
                dir="ltr"
              >
                <div className="flex shrink-0 justify-center">
                  <img
                    src="/home-category-banner.png"
                    alt=""
                    width={640}
                    height={360}
                    className="h-auto w-28 max-h-36 rounded-lg border border-white/15 object-cover object-center shadow-md sm:w-44 sm:max-h-44"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-right" dir="rtl">
                  <p className="text-lg font-extrabold">
                    {t("success.couponTitle")}
                  </p>
                  <p className="text-sm font-bold">
                    {t("success.couponValue").replace(
                      "{value}",
                      String(Number(coupon.value) || 0)
                    )}
                  </p>
                  <p className="text-sm font-semibold">
                    {t("success.couponCode").replace(
                      "{code}",
                      String(coupon.code || "")
                    )}
                  </p>
                  <p className="text-xs text-slate-200">
                    {t("success.couponExpiry").replace(
                      "{date}",
                      formatCouponDate(coupon.expiresAt)
                    )}
                  </p>
                  <p className="text-[11px] text-cyan-200/90">
                    {t("success.couponRedeemSite")}
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-xs font-extrabold text-red-400">
              {t("success.couponScreenshotHint")}
            </p>
          </section>
        ) : null}
        {cardInvoiceNotice ? (
          <p
            className={cardInvoiceNotice.className}
            dir="rtl"
          >
            {cardInvoiceNotice.text}
          </p>
        ) : null}
        {showSuccessCheckBlock ? (
          <>
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-3xl text-emerald-400">
              ✓
            </div>
            <h2 className="mb-2 text-xl font-bold">{title}</h2>
            <p className="mb-4 max-w-sm text-sm text-gray-400">{description}</p>
            {orderFromQuery ? (
              <p className="mb-4 text-xs text-gray-500">
                #{String(orderFromQuery)}
              </p>
            ) : null}
          </>
        ) : null}
        {showMergedWaButton ? (
          <div className="mb-4 flex w-full max-w-md flex-col items-center gap-4 px-3 text-center">
            {showCardWaHeadlineCopy ? (
              <div className="w-full space-y-2">
                <h2 className="text-xl font-extrabold leading-snug text-white sm:text-2xl">
                  {t("success.waCardHeadline")}
                </h2>
                <p className="text-base font-semibold text-slate-200 sm:text-lg">
                  {t("success.waCardNowLine")}
                </p>
              </div>
            ) : null}
            <a
              href={cardWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                const wa = cardWaUrl;

                if (
                  waAdminPushPayload?.orderRowId &&
                  waAdminPushPayload?.orderNumber &&
                  waAdminPushPayload?.adminPushConfirmSecret
                ) {
                  fireDeferredAdminPushNotify(waAdminPushPayload);
                } else if (cardOrder?.orderId) {
                  fireCouponRevealAfterWhatsAppCompose({
                    orderRowId: String(cardOrder.orderId).trim(),
                  });
                }
                const mk = buildSuccessPageMatchKey({
                  method,
                  orderOn: orderFromQuery,
                  hypReturn: payDoneMarker,
                });
                try {
                  window.sessionStorage.setItem(
                    SUCCESS_WA_SENT_KEY,
                    JSON.stringify({ matchKey: mk, savedAt: Date.now() })
                  );
                } catch {
                  /* ignore */
                }

                const opened = window.open(wa, "_blank", "noopener,noreferrer");
                const popupBlocked = !opened || opened.closed;
                setWaComposeAlreadyUsed(true);
                if (popupBlocked) {
                  window.location.href = wa;
                }
              }}
              className={`${waSendClasses} w-full max-w-xs`}
            >
              {t("success.waSendOrder")}
            </a>
          </div>
        ) : postPaymentWhatsAppContext &&
          cardWaUrl &&
          !waComposeAlreadyUsed &&
          !couponReadyForWaButton ? (
          <div
            className="success-loading-bar-track mb-4 shrink-0"
            role="progressbar"
            aria-busy="true"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("success.loadingProgressAria")}
          >
            <div className="success-loading-bar-fill" />
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
