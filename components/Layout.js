import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import FloatingWhatsAppButton from "./FloatingWhatsAppButton";
import CurrentDateTime from "./CurrentDateTime";
import LanguageSwitcher from "./LanguageSwitcher";
import { useLocale } from "@/contexts/LocaleContext";

export default function Layout({ children }) {
  const { t } = useLocale();
  const [hoursOpen, setHoursOpen] = useState(false);
  const [businessHours, setBusinessHours] = useState(null);
  const wazeUrl = "https://waze.com/ul?q=%D7%99%D7%A8%D7%9B%D7%90%20137&navigate=yes";

  const refreshBusinessHours = useCallback(() => {
    fetch("/api/business-hours")
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok && Array.isArray(data.days)) setBusinessHours(data.days);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshBusinessHours();
  }, [refreshBusinessHours]);

  useEffect(() => {
    if (hoursOpen) refreshBusinessHours();
  }, [hoursOpen, refreshBusinessHours]);

  useEffect(() => {
    if (!hoursOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setHoursOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hoursOpen]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-gray-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-black/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden">
              <img
                src="/logo-burger-hut-transparent.png"
                alt="Burger Hut logo icon"
                width={110}
                height={110}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-primary">
                Burger Hut برجرهات
              </h1>
              <p className="text-xs text-gray-400">{t("header.tagline")}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <Link
                href="/admin/orders"
                className="text-xs font-semibold text-primary underline-offset-4 hover:text-amber-400 hover:underline"
              >
                {t("header.admin")}
              </Link>
            </div>
            <div className="flex flex-row items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setHoursOpen(true)}
                className="shrink-0 self-center rounded-full border border-slate-600/80 bg-slate-900/40 px-2.5 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:border-primary/60 hover:bg-slate-800/50"
              >
                {t("home.hoursButton")}
              </button>
              <div className="flex min-w-0 flex-col items-end gap-0.5 text-[11px] text-gray-400">
                <a href={`tel:${t("home.contactPhoneValue")}`} className="hover:text-primary">
                  {t("home.contactPhoneLabel")}: {t("home.contactPhoneValue")}
                </a>
                <span>
                  {t("home.contactAddressLabel")}: {t("home.contactAddressValue")}
                </span>
                <div className="flex flex-col items-end gap-0.5">
                  <a
                    href={wazeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {t("home.openWaze")}
                  </a>
                  <CurrentDateTime className="text-[9px] leading-tight text-gray-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-28 pt-4">{children}</main>
      <FloatingWhatsAppButton />

      {hoursOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setHoursOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="layout-hours-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <h3
                id="layout-hours-title"
                className="text-base font-bold text-primary"
              >
                {t("home.hoursDialogTitle")}
              </h3>
              <button
                type="button"
                onClick={() => setHoursOpen(false)}
                className="rounded-full border border-slate-600 px-2 py-0.5 text-sm leading-none text-gray-400 hover:border-slate-500 hover:text-gray-200"
                aria-label={t("ui.wizardClose")}
              >
                ×
              </button>
            </div>
            {businessHours ? (
              (() => {
                const openDays = businessHours.filter((d) => d.enabled);
                if (!openDays.length) {
                  return (
                    <p className="text-sm text-amber-200/90">
                      {t("home.hoursNoOpenDays")}
                    </p>
                  );
                }
                return (
                  <ul className="space-y-2 text-sm text-gray-100">
                    {openDays.map((d) => (
                      <li key={d.weekday} className="leading-snug">
                        <span className="font-semibold text-gray-200">
                          {t(`weekday.${d.weekday}`)}
                        </span>
                        <span className="text-gray-400">: </span>
                        <span className="font-medium tabular-nums text-primary">
                          {d.open} – {d.close}
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              })()
            ) : (
              <>
                <p className="text-sm text-gray-200">{t("home.hoursDays")}</p>
                <p className="mt-2 text-sm font-semibold text-gray-100">
                  {t("home.hoursTime")}
                </p>
              </>
            )}
            <p className="mt-3 text-sm leading-relaxed text-gray-300">
              {t("home.hoursOrderWindow")}
            </p>
            <button
              type="button"
              onClick={() => setHoursOpen(false)}
              className="btn-primary mt-5 w-full text-sm"
            >
              {t("ui.wizardClose")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


