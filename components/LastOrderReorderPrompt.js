import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useCart } from "@/hooks/useCart";
import { useLocale } from "@/contexts/LocaleContext";
import { formatIls } from "@/utils/cartMoney";
import {
  dismissLastOrderReorderPrompt,
  isLastOrderReorderPromptDismissed,
  readLastOrderForReorder,
} from "@/utils/lastOrderReorder";

export default function LastOrderReorderPrompt() {
  const { t } = useLocale();
  const router = useRouter();
  const { items, replaceCart } = useCart();
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (items.length > 0) {
      setOrder(null);
      return;
    }
    if (isLastOrderReorderPromptDismissed()) {
      setOrder(null);
      return;
    }
    setOrder(readLastOrderForReorder());
  }, [items.length]);

  if (!order?.items?.length) return null;

  const onReorder = () => {
    if (busy) return;
    setBusy(true);
    try {
      replaceCart(order.items);
      dismissLastOrderReorderPrompt();
      void router.push("/checkout");
    } catch {
      setBusy(false);
    }
  };

  const onNewOrder = () => {
    dismissLastOrderReorderPrompt();
    setOrder(null);
  };

  return (
    <section
      className="mb-4 rounded-2xl border border-primary/40 bg-slate-900/80 p-4 shadow-[0_0_28px_-10px_rgba(250,204,21,0.35)]"
      aria-label={t("home.reorderTitle")}
    >
      <h2 className="text-sm font-bold text-primary">{t("home.reorderTitle")}</h2>
      <p className="mt-1 text-xs text-gray-400">{t("home.reorderHint")}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-gray-100">
        {order.items.map((line, idx) => (
          <li
            key={`${line.id || line.productId || "line"}-${idx}`}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="min-w-0 truncate font-medium">{line.name}</span>
            <span className="shrink-0 tabular-nums text-gray-400">
              ×{Math.max(1, Number(line.quantity) || 1)}
            </span>
          </li>
        ))}
      </ul>
      {order.total != null ? (
        <p className="mt-2 text-xs font-semibold text-amber-200">
          {t("home.reorderTotal").replace(
            "{total}",
            `₪${formatIls(order.total)}`
          )}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onReorder}
          disabled={busy}
          className="btn-primary w-full px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {busy ? t("home.reorderBusy") : t("home.reorderAgain")}
        </button>
        <button
          type="button"
          onClick={onNewOrder}
          disabled={busy}
          className="w-full rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"
        >
          {t("home.reorderNew")}
        </button>
      </div>
    </section>
  );
}
