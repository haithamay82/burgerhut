import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { useLocale } from "@/contexts/LocaleContext";
import { useCart } from "@/hooks/useCart";
import { consumePendingOrderForCheckoutResume } from "@/utils/checkoutResumeFromPending";

export default function PaymentErrorPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { replaceCart } = useCart();

  const backToCheckout = () => {
    if (typeof window === "undefined") return;
    const { items } = consumePendingOrderForCheckoutResume();
    if (items.length) replaceCart(items);
    router.push("/checkout");
  };

  return (
    <Layout>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-3xl text-red-400">
          !
        </div>
        <h2 className="mb-2 text-xl font-bold">{t("paymentError.title")}</h2>
        <p className="mb-6 max-w-sm text-sm text-bh-faint">
          {t("paymentError.desc")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={backToCheckout} className="btn-primary">
            {t("paymentError.backCheckout")}
          </button>
          <Link
            href="/"
            className="rounded-xl border border-bh-border-strong px-4 py-2 text-sm text-bh-muted"
          >
            {t("paymentError.backMenu")}
          </Link>
        </div>
      </div>
    </Layout>
  );
}
