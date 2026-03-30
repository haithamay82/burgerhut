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
        <div className="mx-auto grid max-w-4xl grid-cols-[auto_1fr_auto] items-start gap-2 px-4 py-3">
          <div className="flex items-center pt-1">
            <LanguageSwitcher />
          </div>

          <div className="flex min-w-0 flex-col items-center text-center">
            <div className="h-[4.2rem] w-[4.2rem] shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-white/15">
              <img
                src="/logo-burger-hut.png"
                alt="Burger Hut logo icon"
                width={132}
                height={132}
                className="h-full w-full object-contain object-center"
              />
            </div>
            <h1 className="inline-flex items-center gap-1 whitespace-nowrap text-base font-extrabold tracking-tight text-primary sm:text-xl">
              <span dir="ltr">Burger Hut</span>
              <span dir="rtl">{t("header.brandSecondary")}</span>
            </h1>
            <p className="whitespace-nowrap text-[11px] text-gray-400 sm:text-xs">
              {t("header.tagline")}
            </p>
          </div>

          <div className="flex min-w-0 flex-col items-end gap-0.5 pt-1 text-[11px] text-gray-400">
            <Link
              href="/admin/orders"
              className="mb-0.5 text-xs font-semibold text-primary underline-offset-4 hover:text-amber-400 hover:underline"
            >
              {t("header.admin")}
            </Link>
            <a
              href={`tel:${t("home.contactPhoneValue")}`}
              className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"
              aria-label={`${t("home.contactPhoneLabel")}: ${t("home.contactPhoneValue")}`}
            >
              <span className="inline-flex h-4 w-4 shrink-0 overflow-hidden rounded-md ring-1 ring-white/15">
                <img
                  src="/phone-icon.png"
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full scale-110 object-cover"
                  draggable={false}
                />
              </span>
              <span className="underline decoration-sky-400 underline-offset-2">
                {t("home.contactPhoneValue")}
              </span>
            </a>
            <span>
              {t("home.contactAddressLabel")}: {t("home.contactAddressValue")}
            </span>
            <CurrentDateTime className="text-[9px] leading-tight text-gray-500" />
          </div>

          <div className="relative col-span-3 mt-2 flex min-h-[2.75rem] w-full items-center justify-center">
            <a
              href={wazeUrl}
              target="_blank"
              rel="noreferrer"
              className="absolute left-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-transparent p-1 shadow-sm ring-1 ring-white/10 transition-opacity hover:opacity-90 sm:h-12 sm:w-12 sm:p-1.5"
              aria-label={t("home.openWaze")}
              title={t("home.openWaze")}
            >
              <img
                src="/waze-icon.png"
                alt=""
                width={48}
                height={48}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            </a>
            <button
              type="button"
              onClick={() => setHoursOpen(true)}
              className="rounded-full border border-slate-600/80 bg-slate-900/40 px-3 py-1 text-[10px] font-semibold text-primary transition-colors hover:border-primary/60 hover:bg-slate-800/50"
            >
              {t("home.hoursButton")}
            </button>
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


