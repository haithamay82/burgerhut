import Link from "next/link";
import Layout from "@/components/Layout";
import { useLocale } from "@/contexts/LocaleContext";

export default function PaymentErrorPage() {
  const { t } = useLocale();

  return (
    <Layout>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-3xl text-red-400">
          !
        </div>
        <h2 className="mb-2 text-xl font-bold">{t("paymentError.title")}</h2>
        <p className="mb-6 max-w-sm text-sm text-gray-400">
          {t("paymentError.desc")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/checkout" className="btn-primary">
            {t("paymentError.backCheckout")}
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-gray-300"
          >
            {t("paymentError.backMenu")}
          </Link>
        </div>
      </div>
    </Layout>
  );
}
