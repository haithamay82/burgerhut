import Link from "next/link";
import Layout from "@/components/Layout";
import { useLocale } from "@/contexts/LocaleContext";

export default function CancelPage() {
  const { t } = useLocale();

  return (
    <Layout>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-3xl text-amber-400">
          —
        </div>
        <h2 className="mb-6 text-xl font-bold">{t("cancel.title")}</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/checkout" className="btn-primary">
            {t("cancel.backCheckout")}
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-bh-border-strong px-4 py-2 text-sm text-bh-muted"
          >
            {t("cancel.backMenu")}
          </Link>
        </div>
      </div>
    </Layout>
  );
}
