import Link from "next/link";
import PromoVideoOverlay from "@/components/PromoVideoOverlay";
import StickyCartBar from "@/components/StickyCartBar";
import { useOrderingHours } from "@/contexts/OrderingHoursContext";
import { getJerusalemWeekday } from "@/utils/orderingHours";
import MenuItemCard from "@/components/MenuItemCard";
import { useMealWizard } from "@/contexts/MealWizardContext";
import { CATEGORIES, SHOW_SPECIALS_IN_HOME_MENU } from "@/utils/menuData";
import { useMenuCatalog } from "@/contexts/MenuCatalogContext";
import { useLocale } from "@/contexts/LocaleContext";
import { formatIls } from "@/utils/cartMoney";
import { useEffect, useState } from "react";
import HomeMediaSlider from "@/components/HomeMediaSlider";
import HomeBurgerMascot from "@/components/HomeBurgerMascot";
import TypingLoopText from "@/components/TypingLoopText";

export default function HomeMain({
  initialHomeSliderImages = [],
  initialSliderVersion = 0,
}) {
  const { t } = useLocale();
  const { menuItems } = useMenuCatalog();
  const {
    orderingAllowed,
    restaurantOpen,
    todayScheduledOpen,
    todayOpenTimeDisplay,
    todayClosedReason,
  } = useOrderingHours();
  const showPreOrderInfoBanner =
    orderingAllowed &&
    !restaurantOpen &&
    todayScheduledOpen;
  const [activeCategory, setActiveCategory] = useState("burgers");
  const { openMealFromMenu, addSpecialMealQuick } = useMealWizard();
  const homeCategories = CATEGORIES.filter(
    (c) => SHOW_SPECIALS_IN_HOME_MENU || c.id !== "specials"
  );
  const [discountCfg, setDiscountCfg] = useState({
    enabled: false,
    percent: 0,
    minOrderTotal: 0,
    reason: "",
  });
  const mapQuery = encodeURIComponent("ירכא 137");
  const mapEmbedSrc = `https://www.google.com/maps?q=${mapQuery}&output=embed`;
  const mapOpenUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const wazeOpenUrl = `https://waze.com/ul?q=${mapQuery}&navigate=yes`;

  const filteredItems = menuItems
    .filter((item) => item.category === activeCategory)
    .sort((a, b) => a.basePrice - b.basePrice);
  const discountActive =
    discountCfg.enabled &&
    Number(discountCfg.percent) > 0 &&
    Number(discountCfg.minOrderTotal) >= 0;

  useEffect(() => {
    let cancelled = false;
    const loadDiscount = async () => {
      try {
        const r = await fetch("/api/discount");
        const d = await r.json().catch(() => ({}));
        if (cancelled || !r.ok || !d?.ok) return;
        setDiscountCfg({
          enabled: Boolean(d.enabled),
          percent: Number(d.percent) || 0,
          minOrderTotal: Number(d.minOrderTotal) || 0,
          reason: String(d.reason ?? ""),
        });
      } catch {
        /* ignore */
      }
    };
    loadDiscount();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!SHOW_SPECIALS_IN_HOME_MENU && activeCategory === "specials") {
      setActiveCategory("burgers");
    }
  }, [activeCategory]);

  const showClosedTodayFloat = !orderingAllowed && !todayScheduledOpen;

  const specialsNewStickerClassName =
    "pointer-events-none absolute left-0 top-1/2 z-[2] -translate-x-[44%] -translate-y-1/2 -rotate-[13deg] whitespace-nowrap rounded-sm border border-emerald-100/95 bg-gradient-to-br from-lime-300 via-emerald-400 to-emerald-600 px-[5px] py-px text-[9px] font-black leading-none text-emerald-950 shadow-[0_0_14px_rgba(52,211,153,0.95),0_0_28px_rgba(16,185,129,0.5)] ring-1 ring-emerald-200/90 drop-shadow-[0_0_6px_rgba(110,231,183,0.9)] sm:px-1 sm:py-0.5 sm:text-[10px]";

  return (
    <>
      {showClosedTodayFloat ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-[max(6rem,32vh)] z-[28] flex justify-center px-4"
          aria-live="polite"
        >
          <div
            className="max-w-md rounded-2xl border-2 border-red-500 bg-red-950/95 px-4 py-3.5 text-center shadow-[0_8px_40px_-8px_rgba(0,0,0,0.85)] ring-1 ring-red-400/30 backdrop-blur-md"
            role="status"
          >
            <p className="text-sm font-extrabold leading-snug text-red-50">
              {t("home.orderingClosedBannerDayOff").replace(
                "{day}",
                t(`weekday.${getJerusalemWeekday(new Date())}`)
              )}
            </p>
            {todayClosedReason ? (
              <p className="mt-2 text-sm font-semibold leading-snug text-red-100/90">
                {todayClosedReason}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {showPreOrderInfoBanner ? (
        <p
          className="mb-4 min-h-[3.25rem] rounded-xl border-2 border-blue-500 bg-blue-950/80 p-3 text-sm font-bold leading-snug text-white shadow-[0_0_24px_-4px_rgba(59,130,246,0.45)]"
          role="status"
        >
          <TypingLoopText
            text={t("home.preOrderBanner").replace(
              "{openTime}",
              todayOpenTimeDisplay
            )}
            className="block"
          />
        </p>
      ) : null}
      {!orderingAllowed && todayScheduledOpen ? (
        <p
          className="mb-4 rounded-xl border-2 border-blue-500 bg-blue-950/80 p-3 text-sm font-bold leading-snug text-white shadow-[0_0_24px_-4px_rgba(59,130,246,0.45)]"
          role="status"
        >
          {t("home.orderingClosedBannerOpenDay")}
        </p>
      ) : null}
      {discountActive ? (
        <section className="promo-banner-shimmer mb-4 rounded-2xl border-2 border-amber-300/70 bg-gradient-to-r from-fuchsia-900/70 via-violet-900/60 to-amber-900/70 p-3 shadow-[0_0_30px_-8px_rgba(251,191,36,0.75)] ring-1 ring-fuchsia-300/40">
          <p className="text-sm font-extrabold leading-snug text-amber-100 drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]">
            {(discountCfg.reason
              ? t("home.discountAnnounceWithReason")
              : t("home.discountAnnounceNoReason")
            )
              .replace("{reason}", discountCfg.reason || "")
              .replace(
                "{percent}",
                Number(discountCfg.percent).toFixed(2).replace(/\.00$/, "")
              )
              .replace(
                "{min}",
                `₪${formatIls(Number(discountCfg.minOrderTotal) || 0)}`
              )}
          </p>
        </section>
      ) : null}
      <section className="mb-4">
        <div className="min-w-0">
          <h2 className="mb-1 flex w-full min-h-0 justify-center text-lg font-bold leading-tight [--home-title-mascot:calc(2lh+0.25rem)]">
            <span className="inline-flex min-h-0 max-w-full items-center gap-1">
              <span className="flex min-h-0 min-w-0 flex-col justify-center gap-1">
                <span>{t("home.titleLine1")}</span>
                <span className="inline-flex flex-wrap items-baseline gap-x-1 gap-y-0">
                  <span>{t("home.titleLine2")}</span>
                  <span className="text-red-600">❤</span>
                </span>
              </span>
              <HomeBurgerMascot
                size="titleBlock"
                className="pointer-events-none"
              />
            </span>
          </h2>
          <p className="mt-2 rounded-xl border border-amber-900/40 bg-amber-950/30 p-3 text-[11px] leading-relaxed text-amber-100/90">
            {t("home.mealInfo")}
          </p>
        </div>
      </section>

      <section
        className="relative mb-4 rounded-2xl border border-slate-800 shadow-xl"
        aria-label={t("home.categoryBannerAria")}
      >
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl bg-cover bg-center"
          style={{ backgroundImage: "url(/home-category-banner.png)" }}
          aria-hidden
        />
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl bg-gradient-to-t from-black/70 via-black/45 to-black/30"
          aria-hidden
        />
        <div className="relative z-10 flex min-h-[9.5rem] w-full min-w-0 items-center px-2 py-6 sm:min-h-[11rem] sm:px-3 md:min-h-[12.5rem]">
          {/* מובייל: מיוחדים בשורה שנייה מתחת לבורגרים; מסכים רחבים: שורה אחת עם כל הקטגוריות */}
          <div className="w-full sm:hidden">
            <div className="grid w-full grid-cols-4 gap-1.5">
              {["burgers", "crispy", "sides", "drinks"].map((catId) => (
                <button
                  key={catId}
                  type="button"
                  onClick={() => setActiveCategory(catId)}
                  className={`flex min-h-[2.5rem] w-full items-center justify-center rounded-full border px-1 py-1.5 text-center text-[12px] font-semibold leading-tight shadow-md backdrop-blur-sm transition-colors ${
                    activeCategory === catId
                      ? "border-primary bg-primary text-black shadow-lg ring-2 ring-primary/40"
                      : "border-white/25 bg-black/50 text-gray-100 hover:border-white/40 hover:bg-black/65"
                  }`}
                >
                  {t(`cat.${catId}`)}
                </button>
              ))}
            </div>
            {SHOW_SPECIALS_IN_HOME_MENU ? (
              <div className="mt-1.5 grid w-full grid-cols-4 gap-1.5">
                <div className="relative isolate min-w-0">
                  <span
                    className={specialsNewStickerClassName}
                    aria-hidden
                  >
                    {t("home.specialsNewBadge")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveCategory("specials")}
                    aria-label={`${t("cat.specials")}, ${t("home.specialsNewBadge")}`}
                    className={`relative z-[1] flex min-h-[2.5rem] w-full items-center justify-center rounded-full border px-1 py-1.5 text-center text-[12px] font-semibold leading-tight shadow-md backdrop-blur-sm transition-colors ${
                      activeCategory === "specials"
                        ? "border-primary bg-primary text-black shadow-lg ring-2 ring-primary/40"
                        : "border-white/25 bg-black/50 text-gray-100 hover:border-white/40 hover:bg-black/65"
                    }`}
                  >
                    {t("cat.specials")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="hidden w-full sm:flex sm:flex-nowrap sm:items-center sm:justify-center sm:gap-2">
            {homeCategories.map((cat) =>
              cat.id === "specials" ? (
                <div
                  key={cat.id}
                  className="relative isolate flex-none"
                >
                  <span
                    className={specialsNewStickerClassName}
                    aria-hidden
                  >
                    {t("home.specialsNewBadge")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    aria-label={`${t("cat.specials")}, ${t("home.specialsNewBadge")}`}
                    className={`relative z-[1] flex min-h-[2.5rem] w-full min-w-0 max-w-[11rem] flex-1 items-center justify-center rounded-full border px-2 py-1.5 text-center text-[12px] font-semibold leading-tight shadow-md backdrop-blur-sm transition-colors sm:min-h-0 sm:w-auto sm:max-w-none sm:flex-none sm:whitespace-nowrap sm:px-4 sm:py-2 sm:text-[16.8px] sm:leading-normal ${
                      activeCategory === cat.id
                        ? "border-primary bg-primary text-black shadow-lg ring-2 ring-primary/40"
                        : "border-white/25 bg-black/50 text-gray-100 hover:border-white/40 hover:bg-black/65"
                    }`}
                  >
                    {t(`cat.${cat.id}`)}
                  </button>
                </div>
              ) : (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex min-h-[2.5rem] w-full min-w-0 max-w-[11rem] flex-1 items-center justify-center rounded-full border px-2 py-1.5 text-center text-[12px] font-semibold leading-tight shadow-md backdrop-blur-sm transition-colors sm:min-h-0 sm:w-auto sm:max-w-none sm:flex-none sm:whitespace-nowrap sm:px-4 sm:py-2 sm:text-[16.8px] sm:leading-normal ${
                    activeCategory === cat.id
                      ? "border-primary bg-primary text-black shadow-lg ring-2 ring-primary/40"
                      : "border-white/25 bg-black/50 text-gray-100 hover:border-white/40 hover:bg-black/65"
                  }`}
                >
                  {t(`cat.${cat.id}`)}
                </button>
              )
            )}
          </div>
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3 pb-36">
        {filteredItems.flatMap((item) => {
          const row = (
            <div key={item.id} className="contents">
              <MenuItemCard
                item={item}
                onOpenMealWizard={openMealFromMenu}
                onOpenSpecialSaladsEdit={(it) =>
                  openMealFromMenu(it, { mode: "editSalads" })
                }
                onSpecialQuickAdd={addSpecialMealQuick}
              />
            </div>
          );
          if (activeCategory === "burgers" && item.id === "burger-160") {
            return [
              row,
              <div
                key="home-media-slider"
                className="min-w-0 w-full max-w-full"
              >
                <HomeMediaSlider
                  initialImages={initialHomeSliderImages}
                  initialVersion={initialSliderVersion}
                />
              </div>,
            ];
          }
          return [row];
        })}
      </section>

      <section
        className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-3"
        aria-labelledby="home-terms-heading"
      >
        <h3
          id="home-terms-heading"
          className="mb-2 text-sm font-semibold text-gray-100"
        >
          {t("home.termsTitle")}
        </h3>
        <p className="mb-2 text-[11px] leading-relaxed text-gray-300">
          {t("home.termsLead")}
        </p>
        <p className="text-[11px] leading-relaxed text-gray-400">
          {t("home.termsLawCitation")}
        </p>
      </section>

      <section className="mb-24 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 text-sm font-semibold">{t("home.contactTitle")}</h3>
        <div className="mb-3 space-y-1 text-xs text-gray-300">
          <p className="inline-flex flex-wrap items-center gap-1">
            <span className="inline-flex h-4 w-4 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
              <img
                src="/phone-icon.png"
                alt=""
                width={32}
                height={32}
                className="h-full w-full object-cover"
                draggable={false}
              />
            </span>
            <a
              href={`tel:${t("home.contactPhoneValue")}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {t("home.contactPhoneValue")}
            </a>
          </p>
          <p>
            <span className="text-gray-400">{t("home.contactAddressLabel")}:</span>{" "}
            {t("home.contactAddressValue")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={mapOpenUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-primary underline-offset-2 hover:underline"
            >
              {t("home.openMap")}
            </a>
            <a
              href={wazeOpenUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-primary underline-offset-2 hover:underline"
            >
              {t("home.openWaze")}
            </a>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <iframe
            title="store-location-map"
            src={mapEmbedSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-56 w-full border-0"
          />
        </div>
        <div className="mt-3 flex justify-center border-t border-slate-800/80 pt-3">
          <Link
            href="/admin/orders"
            className="h-8 w-8 shrink-0 cursor-pointer rounded-[2px] border border-slate-900 bg-black/70 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] transition-colors hover:border-slate-800 hover:bg-black/90 focus-visible:outline focus-visible:outline-1 focus-visible:outline-slate-600 focus-visible:outline-offset-2"
            title=""
          >
            <span className="sr-only">{t("home.adminDiscreetSr")}</span>
          </Link>
        </div>
        <div className="mt-3 space-y-1 border-t border-slate-800/60 pt-3 text-center">
          <p className="text-[10px] leading-snug text-gray-500">
            {t("home.contactCopyright")}
          </p>
          <a
            href={`mailto:${t("home.contactCopyrightEmail")}`}
            className="block text-[10px] font-medium text-primary underline-offset-2 hover:underline"
            dir="ltr"
          >
            {t("home.contactCopyrightEmail")}
          </a>
        </div>
      </section>

      <StickyCartBar />
      <PromoVideoOverlay />
    </>
  );
}
