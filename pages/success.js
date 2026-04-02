import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "@/components/Layout";
import { useLocale } from "@/contexts/LocaleContext";
import { buildWhatsAppUrl } from "@/utils/whatsapp";
import {
  buildSuccessPageMatchKey,
  CARD_SUCCESS_SNAPSHOT_KEY,
  PENDING_ORDER_KEY,
  SUCCESS_WA_RESTORE_KEY,
  SUCCESS_WA_SENT_KEY,
  SUCCESS_WA_SNAPSHOT_KEY,
} from "@/utils/checkoutSessionKeys";

export default function SuccessPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const method = router.query.method || "";
  const orderFromQuery = Array.isArray(router.query.on)
    ? router.query.on[0]
    : router.query.on;
  const hypReturn =
    router.query.uniqueID ||
    router.query.uniqueid ||
    router.query.txId ||
    router.query.cgUid ||
    router.query.Id;
  const [cardWaUrl, setCardWaUrl] = useState("");
  const [cardOrder, setCardOrder] = useState(null);
  const [coupon, setCoupon] = useState(null);
  /** אחרי ניסיון טעינת קופון (או מטמון) — מאפשר ווטסאפ גם אם לא נוצר קופון */
  const [couponFetchSettled, setCouponFetchSettled] = useState(false);
  const [waComposeAlreadyUsed, setWaComposeAlreadyUsed] = useState(false);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    if (hypReturn) {
      try {
        window.sessionStorage.removeItem(PENDING_ORDER_KEY);
      } catch {
        /* ignore */
      }
    }
    if (!hypReturn && method !== "card" && method !== "cash") return;

    const methodStr = String(method || "");
    const snapshotKey =
      methodStr === "cash" ? SUCCESS_WA_SNAPSHOT_KEY : CARD_SUCCESS_SNAPSHOT_KEY;

    const buildMatchKey = () =>
      buildSuccessPageMatchKey({
        method: methodStr,
        orderOn: orderFromQuery,
        hypReturn,
      });

    const RESTORE_MAX_AGE_MS = 48 * 3600 * 1000;

    try {
      const rawRestore = window.sessionStorage.getItem(SUCCESS_WA_RESTORE_KEY);
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
            restored.cardOrder?.amount != null
          ) {
            setCardOrder({
              orderId: String(restored.cardOrder.orderId),
              amount: Number(restored.cardOrder.amount) || 0,
            });
          }
          return;
        }
      }
    } catch {
      /* fall through to snapshot */
    }

    try {
      const raw = window.sessionStorage.getItem(snapshotKey);
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
      const nextCardOrder = {
        orderId: String(
          snap.cardUniqueId ?? snap.orderNumber ?? orderFromQuery ?? hypReturn ?? ""
        ),
        amount:
          (Number.isFinite(amountFromSnap) && amountFromSnap > 0
            ? amountFromSnap
            : amountFromItems) || 0,
      };
      setCardWaUrl(url);
      setCardOrder(nextCardOrder);
      try {
        window.sessionStorage.setItem(
          SUCCESS_WA_RESTORE_KEY,
          JSON.stringify({
            matchKey: buildMatchKey(),
            waUrl: url,
            cardOrder: nextCardOrder,
            savedAt: Date.now(),
          })
        );
        window.sessionStorage.removeItem(snapshotKey);
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  }, [router.isReady, hypReturn, method, locale, orderFromQuery]);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    if (!(hypReturn || method === "card" || method === "cash")) return;
    const mk = buildSuccessPageMatchKey({
      method,
      orderOn: orderFromQuery,
      hypReturn,
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
  }, [router.isReady, hypReturn, method, orderFromQuery]);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    if (!(hypReturn || method === "card" || method === "cash")) {
      setCouponFetchSettled(true);
      return;
    }
    if (!cardOrder?.orderId || !cardOrder?.amount) {
      return;
    }

    const sessionKey = `bh_coupon_created_${cardOrder.orderId}`;
    try {
      const cached = window.sessionStorage.getItem(sessionKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.code) {
          setCoupon(parsed);
          setCouponFetchSettled(true);
          return;
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
            amount: cardOrder.amount,
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (active && r.ok && d?.ok && d?.coupon?.code) {
          setCoupon(d.coupon);
          try {
            window.sessionStorage.setItem(sessionKey, JSON.stringify(d.coupon));
          } catch {
            /* ignore */
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
  }, [router.isReady, hypReturn, method, cardOrder]);

  const title = hypReturn
    ? t("success.paymentCompleted")
    : method === "online"
      ? t("success.titleOnline")
      : method === "cash" || method === "bit"
        ? t("success.titleOk")
        : method === "card"
          ? t("success.paymentCompleted")
          : t("success.titleOk");

  const description = hypReturn
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

  /** פעיל רק כשבלוק הקופון מוצג (יש קוד) */
  const waLinkActive = Boolean(coupon?.code);

  const waLinkLabel =
    coupon?.code && Number(coupon?.value) > 0
      ? t("success.waAfterCardWithCoupon").replace(
          "{value}",
          String(Number(coupon.value) || 0)
        )
      : t("success.waAfterCard");

  return (
    <Layout>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
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
        {(hypReturn || method === "card" || method === "cash") && coupon?.code ? (
          <section className="mb-3 w-full max-w-sm rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-900 via-slate-950 to-cyan-950 p-4 text-right text-white">
            <div className="relative rounded-xl border border-white/10 bg-slate-950/70 p-3 pt-10">
              <img
                src="/logo-burger-hut.png"
                alt="Burger Hut"
                width={36}
                height={36}
                className="absolute left-3 top-3 h-9 w-9 rounded-full border border-white/30 bg-white/95 p-0.5 object-cover"
              />
              <p className="text-lg font-extrabold">{t("success.couponTitle")}</p>
              <p className="mt-1 text-sm font-bold">
                {t("success.couponValue").replace(
                  "{value}",
                  String(Number(coupon.value) || 0)
                )}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {t("success.couponCode").replace("{code}", String(coupon.code || ""))}
              </p>
              <p className="mt-1 text-xs text-slate-200">
                {t("success.couponExpiry").replace(
                  "{date}",
                  formatCouponDate(coupon.expiresAt)
                )}
              </p>
              <p className="mt-1 text-[11px] text-cyan-200/90">
                {t("success.couponRedeemSite")}
              </p>
            </div>
            <p className="mt-2 text-center text-xs font-extrabold text-red-400">
              {t("success.couponScreenshotHint")}
            </p>
          </section>
        ) : null}
        {(hypReturn || method === "card" || method === "cash") &&
        cardWaUrl &&
        !waComposeAlreadyUsed ? (
          <div className="mb-4 w-full max-w-xs">
            {waLinkActive ? (
              <a
                href={cardWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  const mk = buildSuccessPageMatchKey({
                    method,
                    orderOn: orderFromQuery,
                    hypReturn,
                  });
                  try {
                    window.sessionStorage.setItem(
                      SUCCESS_WA_SENT_KEY,
                      JSON.stringify({ matchKey: mk, savedAt: Date.now() })
                    );
                  } catch {
                    /* ignore */
                  }
                  setWaComposeAlreadyUsed(true);
                }}
                className="btn-primary block whitespace-pre-line px-4 py-3 text-center leading-snug"
              >
                {waLinkLabel}
              </a>
            ) : (
              <>
                <span
                  className="btn-primary block cursor-not-allowed whitespace-pre-line px-4 py-3 text-center leading-snug opacity-45 pointer-events-none select-none"
                  aria-disabled="true"
                >
                  {waLinkLabel}
                </span>
                <p className="mt-2 text-[11px] leading-snug text-gray-500">
                  {couponFetchSettled
                    ? t("success.waNoCouponLoaded")
                    : t("success.waWaitForCoupon")}
                </p>
              </>
            )}
          </div>
        ) : null}
        <Link
          href="/"
          className="btn-primary"
          onClick={() => {
            try {
              window.sessionStorage.removeItem(SUCCESS_WA_RESTORE_KEY);
            } catch {
              /* ignore */
            }
          }}
        >
          {t("success.back")}
        </Link>
      </div>
    </Layout>
  );
}
