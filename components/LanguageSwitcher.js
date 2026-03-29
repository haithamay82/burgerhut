import { useLocale } from "@/contexts/LocaleContext";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      className="flex rounded-full border border-slate-700 bg-slate-900/50 p-0.5"
      role="group"
      aria-label={t("lang.switch")}
    >
      <button
        type="button"
        onClick={() => setLocale("he")}
        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
          locale === "he"
            ? "bg-primary text-black"
            : "text-gray-400 hover:text-gray-200"
        }`}
      >
        {t("lang.he")}
      </button>
      <button
        type="button"
        onClick={() => setLocale("ar")}
        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
          locale === "ar"
            ? "bg-primary text-black"
            : "text-gray-400 hover:text-gray-200"
        }`}
      >
        {t("lang.ar")}
      </button>
    </div>
  );
}
