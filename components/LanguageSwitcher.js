import { useLocale } from "@/contexts/LocaleContext";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      className="relative isolate flex rounded-full border border-slate-700 bg-slate-900/50 p-0.5 touch-manipulation"
      role="group"
      aria-label={t("lang.switch")}
    >
      <button
        type="button"
        onClick={() => setLocale("he")}
        className={`min-h-[40px] min-w-[2.75rem] rounded-full px-3 py-2 text-[11px] font-semibold transition-colors sm:min-h-0 sm:min-w-0 sm:px-2.5 sm:py-1 sm:text-[10px] ${
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
        className={`min-h-[40px] min-w-[2.75rem] rounded-full px-3 py-2 text-[11px] font-semibold transition-colors sm:min-h-0 sm:min-w-0 sm:px-2.5 sm:py-1 sm:text-[10px] ${
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
