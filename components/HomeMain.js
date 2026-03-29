import PromoVideoOverlay from "@/components/PromoVideoOverlay";
import CurrentDateTime from "@/components/CurrentDateTime";
import StickyCartBar from "@/components/StickyCartBar";
import { useOrderingHours } from "@/contexts/OrderingHoursContext";
import MenuItemCard from "@/components/MenuItemCard";
import MealCustomizeWizard from "@/components/MealCustomizeWizard";
import { CATEGORIES, MENU_ITEMS } from "@/utils/menuData";
import { useLocale } from "@/contexts/LocaleContext";
import { useState } from "react";

export default function HomeMain() {
  const { t } = useLocale();
  const { orderingAllowed } = useOrderingHours();
  const [activeCategory, setActiveCategory] = useState("burgers");
  const [mealWizardItem, setMealWizardItem] = useState(null);
  const mapQuery = encodeURIComponent("ירכא 137");
  const mapEmbedSrc = `https://www.google.com/maps?q=${mapQuery}&output=embed`;
  const mapOpenUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const wazeOpenUrl = `https://waze.com/ul?q=${mapQuery}&navigate=yes`;

  const filteredItems = MENU_ITEMS.filter(
    (item) => item.category === activeCategory
  ).sort((a, b) => a.basePrice - b.basePrice);

  return (
    <>
      {!orderingAllowed ? (
        <p
          className="mb-4 rounded-xl border border-amber-800/60 bg-amber-950/40 p-3 text-sm font-medium leading-snug text-amber-100"
          role="status"
        >
          {t("home.orderingClosedBanner")}
        </p>
      ) : null}
      <section className="mb-4">
        <h2 className="mb-1 text-lg font-bold">{t("home.title")}</h2>
        <p className="text-xs text-gray-400">{t("home.subtitle")}</p>
        <p className="mt-2 rounded-xl border border-amber-900/40 bg-amber-950/30 p-3 text-[11px] leading-relaxed text-amber-100/90">
          {t("home.mealInfo")}
        </p>
      </section>

      <section
        className="relative mb-4 overflow-hidden rounded-2xl border border-slate-800 shadow-xl"
        aria-label={t("home.categoryBannerAria")}
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/home-category-banner.png)" }}
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/45 to-black/30"
          aria-hidden
        />
        <div className="relative z-10 flex min-h-[9.5rem] w-full min-w-0 items-center px-2 py-6 sm:min-h-[11rem] sm:px-3 md:min-h-[12.5rem]">
          {/* מובייל: ארבע עמודות — שורה אחת; מסכים רחבים: שורה אחת ממורכזת בלי wrap */}
          <div className="grid w-full grid-cols-4 gap-1.5 sm:flex sm:w-full sm:flex-nowrap sm:items-center sm:justify-center sm:gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`flex min-h-[2.5rem] w-full items-center justify-center rounded-full border px-1 py-1.5 text-center text-[10px] font-semibold leading-tight shadow-md backdrop-blur-sm transition-colors sm:min-h-0 sm:w-auto sm:whitespace-nowrap sm:px-4 sm:py-2 sm:text-sm sm:leading-normal ${
                  activeCategory === cat.id
                    ? "border-primary bg-primary text-black shadow-lg ring-2 ring-primary/40"
                    : "border-white/25 bg-black/50 text-gray-100 hover:border-white/40 hover:bg-black/65"
                }`}
              >
                {t(`cat.${cat.id}`)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 pb-36">
        {filteredItems.map((item) => (
          <MenuItemCard
            key={item.id}
            item={item}
            onOpenMealWizard={setMealWizardItem}
          />
        ))}
      </section>

      <MealCustomizeWizard
        item={mealWizardItem}
        open={mealWizardItem != null}
        onClose={() => setMealWizardItem(null)}
      />

      <section className="mb-24 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 text-sm font-semibold">{t("home.contactTitle")}</h3>
        <div className="mb-3 space-y-1 text-xs text-gray-300">
          <p>
            <span className="text-gray-400">{t("home.contactPhoneLabel")}:</span>{" "}
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
            <div className="inline-flex flex-col gap-0.5">
              <a
                href={wazeOpenUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-primary underline-offset-2 hover:underline"
              >
                {t("home.openWaze")}
              </a>
              <CurrentDateTime className="text-[10px] leading-tight text-gray-500" />
            </div>
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
      </section>

      <StickyCartBar />
      <PromoVideoOverlay />
    </>
  );
}
