import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "@/components/Layout";
import { useLocale } from "@/contexts/LocaleContext";
import { buildWhatsAppUrl } from "@/utils/whatsapp";
import CouponCard from "@/components/CouponCard";
import {
  CARD_SUCCESS_SNAPSHOT_KEY,
  PENDING_ORDER_KEY,
} from "@/utils/checkoutSessionKeys";

export default function SuccessPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const method = router.query.method || "";
  const orderFromQuery = router.query.on;
  const hypReturn =
    router.query.uniqueID ||
    router.query.uniqueid ||
    router.query.txId ||
    router.query.cgUid ||
    router.query.Id;
  const [cardWaUrl, setCardWaUrl] = useState("");
  const [cardOrder, setCardOrder] = useState(null);
  const [coupon, setCoupon] = useState(null);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    if (hypReturn) {
      try {
        window.sessionStorage.removeItem(PENDING_ORDER_KEY);
      } catch {
        /* ignore */
      }
    }
    if (!hypReturn && method !== "card") return;
    try {
      const raw = window.sessionStorage.getItem(CARD_SUCCESS_SNAPSHOT_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw);
      window.sessionStorage.removeItem(CARD_SUCCESS_SNAPSHOT_KEY);
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
      setCardWaUrl(url);
      setCardOrder({
        orderId: String(snap.orderNumber ?? orderFromQuery ?? ""),
        amount: Number(snap.waGrandTotal) || 0,
      });
    } catch {
      /* ignore */
    }
  }, [router.isReady, hypReturn, method, locale, orderFromQuery]);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    if (!(hypReturn || method === "card")) return;
    if (!cardOrder?.orderId || !cardOrder?.amount) return;

    const sessionKey = `bh_coupon_created_${cardOrder.orderId}`;
    try {
      const cached = window.sessionStorage.getItem(sessionKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.code) {
          setCoupon(parsed);
          return;
        }
      }
    } catch {
      /* ignore */
    }

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
        if (!active || !r.ok || !d?.ok || !d?.coupon?.code) return;
        setCoupon(d.coupon);
        try {
          window.sessionStorage.setItem(sessionKey, JSON.stringify(d.coupon));
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
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
        {(hypReturn || method === "card") && coupon?.code ? (
          <CouponCard coupon={coupon} />
        ) : null}
        {(hypReturn || method === "card") && cardWaUrl ? (
          <a
            href={cardWaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mb-4 max-w-xs whitespace-pre-line px-4 py-3 text-center leading-snug"
          >
            {t("success.waAfterCard")}
          </a>
        ) : null}
        <Link href="/" className="btn-primary">
          {t("success.back")}
        </Link>
      </div>
    </Layout>
  );
}
