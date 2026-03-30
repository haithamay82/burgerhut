import { useState, useEffect, useCallback } from "react";
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
      <header className="sticky top-0 z-30 w-full border-b border-slate-800 bg-black/80 backdrop-blur">
        <div className="relative w-full px-4 py-2 sm:py-2.5">
          <div className="pointer-events-none absolute left-1/2 top-2 z-[5] flex -translate-x-1/2 justify-center sm:top-2.5">
            <div className="pointer-events-auto flex max-w-[calc(100vw-4.5rem)] flex-col items-center text-center">
              <div className="h-[4.2rem] w-[4.2rem] shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-white/15">
                <img
                  src="/logo-burger-hut.png"
                  alt="Burger Hut logo icon"
                  width={132}
                  height={132}
                  className="h-full w-full object-contain object-center"
                />
              </div>
              <h1 className="mb-0.5 inline-flex flex-wrap items-center justify-center gap-x-1 gap-y-0 text-base font-extrabold tracking-tight text-primary sm:text-xl">
                <span dir="ltr">Burger Hut</span>
                <span dir="rtl">{t("header.brandSecondary")}</span>
              </h1>
              <p className="mb-0 whitespace-nowrap text-[11px] leading-tight text-gray-400 sm:text-xs">
                {t("header.tagline")}
              </p>
            </div>
          </div>

          <div className="relative z-10 mx-auto min-h-[6.85rem] max-w-4xl sm:min-h-[7.25rem]">
            <div className="flex items-start justify-between gap-2 pt-1">
              <div className="flex shrink-0 items-center">
                <LanguageSwitcher />
              </div>
              <div className="flex min-w-0 max-w-[42%] flex-col items-end gap-0.5 text-right text-[11px] text-gray-400 sm:max-w-[38%]">
                <span>
                  {t("home.contactAddressLabel")}: {t("home.contactAddressValue")}
                </span>
                <CurrentDateTime className="text-[9px] leading-tight text-gray-500" />
              </div>
            </div>
          </div>

          <div className="relative mx-auto flex min-h-[2.25rem] w-full max-w-4xl items-center justify-center">
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
            <a
              href={`tel:${String(t("home.contactPhoneValue")).replace(/\s/g, "")}`}
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-transparent p-1 shadow-sm ring-1 ring-white/10 transition-opacity hover:opacity-90 sm:h-12 sm:w-12 sm:p-1.5"
              aria-label={t("home.callPhoneAria")}
              title={t("home.callPhoneAria")}
            >
              <img
                src="/phone-icon.png"
                alt=""
                width={48}
                height={48}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            </a>
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


