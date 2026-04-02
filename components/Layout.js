import dynamic from "next/dynamic";
import { useState, useEffect, useCallback } from "react";
import FloatingWhatsAppButton from "./FloatingWhatsAppButton";

const PWAInstallLauncher = dynamic(() => import("./PWAInstallLauncher"), {
  ssr: false,
  loading: () => <span className="h-9 w-9 shrink-0" aria-hidden />,
});
import CurrentDateTime from "./CurrentDateTime";
import LanguageSwitcher from "./LanguageSwitcher";
import { useLocale } from "@/contexts/LocaleContext";
import { useOrderingHours } from "@/contexts/OrderingHoursContext";

export default function Layout({ children }) {
  const { t } = useLocale();
  const { orderingAllowed, todayScheduledOpen } = useOrderingHours();
  const showAsOpen = orderingAllowed && todayScheduledOpen;
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
              <div
                className="flex flex-row items-center justify-center gap-2"
                dir="ltr"
              >
                <PWAInstallLauncher />
                <div className="h-[4.2rem] w-[4.2rem] shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-white/15">
                  <img
                    src="/logo-burger-hut.png"
                    alt="Burger Hut logo icon"
                    width={132}
                    height={132}
                    className="h-full w-full scale-115 object-cover object-center"
                  />
                </div>
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
                <CurrentDateTime className="leading-tight" />
                <div className="mt-1 inline-flex items-center gap-1.5" dir="ltr">
                  <a
                    href={t("home.instagramUrl")}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("home.instagramAria")}
                    title={t("home.instagramAria")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-slate-900/50 text-pink-300 transition-colors hover:border-pink-300/70 hover:text-pink-200"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="15"
                      height="15"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 1.8A3.7 3.7 0 0 0 3.8 7.5v9a3.7 3.7 0 0 0 3.7 3.7h9a3.7 3.7 0 0 0 3.7-3.7v-9a3.7 3.7 0 0 0-3.7-3.7h-9Zm9.3 1.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" />
                    </svg>
                  </a>
                  <a
                    href={t("home.tiktokUrl")}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("home.tiktokAria")}
                    title={t("home.tiktokAria")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-slate-900/50 text-cyan-300 transition-colors hover:border-cyan-300/70 hover:text-cyan-200"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="15"
                      height="15"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M14.8 2h2a5.6 5.6 0 0 0 3.2 3.2v2.2a7.7 7.7 0 0 1-3.2-.8v6.6A6.2 6.2 0 1 1 10.6 7v2.4a3.8 3.8 0 1 0 3.9 3.8V2Z" />
                    </svg>
                  </a>
                </div>
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
                width={494}
                height={505}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            </a>
            <div
              className="flex flex-row items-center justify-center gap-2"
              dir="ltr"
            >
              <p
                className="flex max-w-[min(42vw,11rem)] items-center gap-1.5 text-[9px] font-medium leading-tight text-gray-300 sm:max-w-none sm:text-[10px]"
                dir="rtl"
                role="status"
                aria-live="polite"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    showAsOpen ? "bg-emerald-500" : "bg-red-500"
                  }`}
                  aria-hidden
                />
                <span>
                  {showAsOpen
                    ? t("home.restaurantOpen")
                    : t("home.restaurantClosed")}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setHoursOpen(true)}
                className="shrink-0 rounded-full border border-slate-600/80 bg-slate-900/40 px-3 py-1 text-[10px] font-semibold text-primary transition-colors hover:border-primary/60 hover:bg-slate-800/50"
              >
                {t("home.hoursButton")}
              </button>
            </div>
            <a
              href={`tel:${String(t("home.contactPhoneValue")).replace(/\s/g, "")}`}
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-transparent p-1 shadow-sm ring-1 ring-white/10 transition-opacity hover:opacity-90 sm:h-12 sm:w-12 sm:p-1.5"
              aria-label={t("home.callPhoneAria")}
              title={t("home.callPhoneAria")}
            >
              <img
                src="/phone-icon.png"
                alt=""
                width={494}
                height={505}
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


