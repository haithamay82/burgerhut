import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { buildWhatsAppUrl, openWhatsAppComposeUrl } from "@/utils/whatsapp";
import { useLocale } from "@/contexts/LocaleContext";
import { useCart } from "@/hooks/useCart";
import { PENDING_ORDER_KEY } from "@/utils/checkoutSessionKeys";
import { consumePendingOrderForCheckoutResume } from "@/utils/checkoutResumeFromPending";

function normalizeIsraeliPhone(phone) {
  const p = String(phone || "").replace(/[^\d]/g, "");
  if (!p) return "";
  if (p.startsWith("972")) return "0" + p.slice(3);
  return p;
}

function buildBitDeepLinks({ to, amount }) {
  const cleanTo = normalizeIsraeliPhone(to);
  const cleanAmount = String(amount || "").trim();

  return [
    `bit://pay?phone=${encodeURIComponent(cleanTo)}&amount=${encodeURIComponent(cleanAmount)}`,
    `bit://send?phone=${encodeURIComponent(cleanTo)}&amount=${encodeURIComponent(cleanAmount)}`,
    `intent://pay?phone=${encodeURIComponent(cleanTo)}&amount=${encodeURIComponent(
      cleanAmount
    )}#Intent;scheme=bit;package=com.ideomobile.hapoalim;end`,
  ];
}

export default function BitPayPage() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { replaceCart } = useCart();
  const { amount, to } = router.query;
  const [status, setStatus] = useState("");
  const [isSendingWa, setIsSendingWa] = useState(false);

  const phone = useMemo(() => normalizeIsraeliPhone(to || "0504847599"), [to]);
  const total = useMemo(() => String(amount || ""), [amount]);

  const deeplinks = useMemo(
    () => buildBitDeepLinks({ to: phone, amount: total }),
    [phone, total]
  );

  const tryOpenBit = async () => {
    setStatus(t("bit.tryOpen"));
    const url = deeplinks[0];
    if (typeof window !== "undefined") {
      window.location.href = url;
      setTimeout(() => {
        setStatus(t("bit.openFallback"));
      }, 1200);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(t("bit.copied"));
      setTimeout(() => setStatus(""), 900);
    } catch {
      setStatus(t("bit.copyFail"));
    }
  };

  const backToCheckout = () => {
    if (typeof window === "undefined") return;
    const { items } = consumePendingOrderForCheckoutResume();
    if (items.length) replaceCart(items);
    router.push("/checkout");
  };

  const sendOrderWhatsApp = () => {
    if (typeof window === "undefined") return;
    setIsSendingWa(true);
    setStatus(t("bit.waOpening"));

    const raw = window.sessionStorage.getItem(PENDING_ORDER_KEY);
    if (!raw) {
      setStatus(t("bit.errNoSession"));
      setIsSendingWa(false);
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      setStatus(t("bit.errBadJson"));
      setIsSendingWa(false);
      return;
    }

    const { customer, items, payment, orderNumber, locale: savedLocale } = payload;
    const waLocale = savedLocale === "he" || savedLocale === "ar" ? savedLocale : locale;

    if (!items?.length) {
      setStatus(t("bit.errEmptyCart"));
      setIsSendingWa(false);
      return;
    }

    const orderTotal = items.reduce(
      (s, i) => s + Number(i.price) * Number(i.quantity),
      0
    );
    const waTotal =
      typeof payload.waGrandTotal === "number" &&
      Number.isFinite(payload.waGrandTotal)
        ? payload.waGrandTotal
        : orderTotal;

    const waUrl = buildWhatsAppUrl({
      customer,
      cart: { items },
      total: waTotal,
      payment: payment || "bit",
      orderNumber,
      locale: waLocale,
    });
    window.sessionStorage.removeItem(PENDING_ORDER_KEY);
    const how = openWhatsAppComposeUrl(waUrl);
    setIsSendingWa(false);
    if (how === "new_tab") {
      router.push("/success?method=bit");
    }
  };

  return (
    <Layout>
      <section className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="mb-1 text-lg font-bold">{t("bit.title")}</h2>
            <p className="text-xs text-gray-400">{t("bit.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={backToCheckout}
            className="shrink-0 self-start rounded-full border border-slate-600 bg-slate-900/60 px-4 py-2 text-center text-xs font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-slate-800/60 sm:self-center"
          >
            {t("payment.backToCheckout")}
          </button>
        </div>
      </section>

      <section className="card space-y-3 p-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-gray-400">{t("bit.bitNumber")}</p>
              <p className="text-lg font-extrabold tracking-tight text-primary">
                {phone || "0504847599"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => copy(phone || "0504847599")}
              className="rounded-full border border-slate-700 px-3 py-2 text-xs text-gray-200"
            >
              {t("bit.copyNumber")}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-gray-400">{t("bit.amount")}</p>
              <p className="text-lg font-extrabold tracking-tight">₪{total}</p>
            </div>
            <button
              type="button"
              onClick={() => copy(total)}
              className="rounded-full border border-slate-700 px-3 py-2 text-xs text-gray-200"
            >
              {t("bit.copyAmount")}
            </button>
          </div>
        </div>

        <button type="button" onClick={tryOpenBit} className="btn-primary w-full">
          {t("bit.openApp")}
        </button>

        <div className="space-y-2 text-xs text-gray-300">
          <p className="text-[11px] text-gray-400">{t("bit.manualIntro")}</p>
          <ol className="list-decimal space-y-1 pr-5 text-[12px] text-gray-200">
            <li>{t("bit.step1")}</li>
            <li>{t("bit.step2")}</li>
            <li>
              {t("bit.step3")} {phone || "0504847599"}
            </li>
            <li>
              {t("bit.step4")}
              {total}
            </li>
          </ol>
        </div>

        <div className="border-t border-slate-800 pt-3">
          <p className="mb-2 text-[11px] text-gray-400">{t("bit.waHint")}</p>
          <button
            type="button"
            onClick={sendOrderWhatsApp}
            disabled={isSendingWa}
            className="btn-primary inline-flex w-full items-center justify-center disabled:opacity-60"
          >
            {isSendingWa ? t("bit.waOpening") : t("bit.waBtn")}
          </button>
        </div>

        {status ? (
          <p className="text-center text-[11px] text-gray-400">{status}</p>
        ) : null}

        <div className="text-[11px] text-gray-500">{t("bit.note")}</div>
      </section>
    </Layout>
  );
}
