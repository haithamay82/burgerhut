import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { useLocale } from "@/contexts/LocaleContext";
import { useCart } from "@/hooks/useCart";
import {
  PENDING_ORDER_KEY,
  CHECKOUT_RESUME_KEY,
  CARD_SUCCESS_SNAPSHOT_KEY,
} from "@/utils/checkoutSessionKeys";
import { buildCardOrderDetailsFromItems } from "@/utils/cardOrderDetails";

export default function CardPayPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { replaceCart } = useCart();
  const { amount, orderId } = router.query;
  const [sessionErr, setSessionErr] = useState("");
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(false);
  const [payError, setPayError] = useState("");

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(PENDING_ORDER_KEY);
    if (!raw) {
      setSessionErr(t("card.errNoSession"));
      return;
    }
    try {
      const p = JSON.parse(raw);
      if (p.payment !== "card" || !p.customer || !Array.isArray(p.items)) {
        setSessionErr(t("card.errNoSession"));
        return;
      }
      const payN = Number(p.cardOnlinePayAmount);
      if (!Number.isFinite(payN) || payN <= 0) {
        setSessionErr(t("card.errNoSession"));
        return;
      }
      setPending(p);
    } catch {
      setSessionErr(t("bit.errBadJson"));
    }
  }, [router.isReady, t]);

  const backToCheckout = () => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(PENDING_ORDER_KEY);
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p.items) && p.items.length) {
          replaceCart(p.items);
        }
        if (p.checkoutDraft && typeof p.checkoutDraft === "object") {
          window.sessionStorage.setItem(
            CHECKOUT_RESUME_KEY,
            JSON.stringify(p.checkoutDraft)
          );
        }
      } catch {
        /* ignore */
      }
      window.sessionStorage.removeItem(PENDING_ORDER_KEY);
    }
    router.push("/checkout");
  };

  const continueToGateway = useCallback(async () => {
    if (!pending || typeof window === "undefined" || loading) return;
    setPayError("");
    setLoading(true);
    try {
      const totalAmount = Number(pending.cardOnlinePayAmount);
      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalAmount,
          customerName: pending.customer?.name || "",
          phone: pending.customer?.phone || "",
          orderDetails: buildCardOrderDetailsFromItems(pending.items),
          orderNumber: pending.orderNumber,
          uniqueId:
            typeof pending.cardUniqueId === "string"
              ? pending.cardUniqueId
              : String(orderId || ""),
          language: locale === "he" ? "HEB" : "ENG",
        }),
      });
      const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.payment_url) {
          const lines = [t("card.paymentStartFailed")];
          if (data?.error === "hyp_not_configured") {
            lines[0] = t("checkout.cardHypNotConfigured");
            if (Array.isArray(data.missing) && data.missing.length) {
              lines.push(
                `${t("checkout.cardHypMissingLine")}: ${data.missing.join(", ")}`
              );
            }
          } else if (data?.error === "hyp_relay_host_invalid") {
            lines[0] = t("card.hintDnsNotFound");
            if (data.host) {
              lines.push(`${t("card.errorTechnical")}: ${data.host}`);
            }
            if (data.hint) lines.push(data.hint);
          } else if (data?.error === "missing_public_origin") {
            lines[0] = t("checkout.cardMissingSiteUrl");
          } else if (data?.error === "relay_unreachable" && data?.message) {
            lines.push(`${t("card.errorTechnical")}: ${data.message}`);
            if (String(data.message).includes("ENOTFOUND")) {
              lines.push(t("card.hintDnsNotFound"));
            }
            if (data.hint) {
              lines.push(data.hint);
            }
          } else if (data?.error === "relay_http_error") {
            lines.push(
              `HTTP ${data.httpStatus ?? "?"}${
                data.message ? ` — ${data.message}` : ""
              }`
            );
          } else if (data?.error === "hyp_relay_error") {
            if (data.hypResult != null && `${data.hypResult}` !== "") {
              lines.push(`${t("card.errorHypCode")}: ${data.hypResult}`);
            }
            if (data.hypUserMessage) {
              lines.push(data.hypUserMessage);
            } else if (data.hypMessage && data.hypMessage !== "relay_rejected") {
              lines.push(data.hypMessage);
            }
            if (data.bodyPreview) {
              lines.push(`${t("card.errorTechnical")}: ${data.bodyPreview}`);
            }
          } else if (data?.message) {
            lines.push(`${t("card.errorTechnical")}: ${data.message}`);
          }
          setPayError(lines.join("\n"));
          return;
        }

      try {
        window.sessionStorage.setItem(
          CARD_SUCCESS_SNAPSHOT_KEY,
          JSON.stringify({
            customer: pending.customer,
            items: pending.items,
            payment: pending.payment,
            orderNumber: pending.orderNumber,
            locale: pending.locale,
            waGrandTotal: pending.waGrandTotal,
          })
        );
      } catch {
        /* ignore */
      }
      window.sessionStorage.removeItem(PENDING_ORDER_KEY);
      window.location.href = data.payment_url;
    } catch {
      setPayError(t("card.paymentStartFailed"));
    } finally {
      setLoading(false);
    }
  }, [pending, loading, locale, orderId, t]);

  return (
    <Layout>
      <section className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="mb-1 text-lg font-bold">{t("card.title")}</h2>
            <p className="text-xs text-gray-400">{t("card.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={backToCheckout}
            disabled={loading}
            className="shrink-0 self-start rounded-full border border-slate-600 bg-slate-900/60 px-4 py-2 text-center text-xs font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-slate-800/60 disabled:opacity-50 sm:self-center"
          >
            {t("payment.backToCheckout")}
          </button>
        </div>
      </section>

      <section className="card space-y-3 p-3">
        {sessionErr ? (
          <p className="text-sm text-amber-200/90">{sessionErr}</p>
        ) : (
          <>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="text-[11px] text-gray-400">{t("card.amountLabel")}</p>
              <p className="text-lg font-extrabold tracking-tight text-primary">
                ₪{amount || "—"}
              </p>
              {orderId ? (
                <p className="mt-1 text-[10px] text-gray-500">
                  {t("card.orderRef")}: {orderId}
                </p>
              ) : null}
            </div>

            {payError ? (
              <p className="whitespace-pre-line text-[11px] text-red-400">
                {payError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={continueToGateway}
              disabled={!pending || loading}
              className="btn-primary relative w-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden
                  />
                  {t("card.openingPayment")}
                </span>
              ) : (
                t("card.continueExternal")
              )}
            </button>

            <p className="text-center text-[11px] text-gray-500">
              {t("card.afterPayNote")}
            </p>
          </>
        )}

        {sessionErr ? (
          <button
            type="button"
            onClick={() => router.push("/checkout")}
            className="w-full rounded-xl border border-slate-600 py-2 text-xs text-gray-300"
          >
            {t("payment.backToCheckout")}
          </button>
        ) : null}
      </section>
    </Layout>
  );
}
