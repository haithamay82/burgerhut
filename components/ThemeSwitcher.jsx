"use client";

import { useLocale } from "@/contexts/LocaleContext";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * @param {{ compact?: boolean }} props
 */
export default function ThemeSwitcher({ compact = false }) {
  const { t } = useLocale();
  const { themeId, setTheme } = useTheme();

  return (
    <div
      className={`relative isolate flex rounded-full border border-bh-border-strong bg-bh-card p-0.5 touch-manipulation ${
        compact ? "" : ""
      }`}
      role="group"
      aria-label={t("theme.switch")}
    >
      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={`${
          compact
            ? "min-h-[36px] min-w-[2.4rem] px-2 py-1.5 text-[10px]"
            : "min-h-[40px] min-w-[2.75rem] px-3 py-2 text-[11px] sm:min-h-0 sm:min-w-0 sm:px-2.5 sm:py-1 sm:text-[10px]"
        } rounded-full font-semibold transition-colors ${
          themeId === "dark"
            ? "bg-primary text-black"
            : "text-bh-faint hover:text-bh-text"
        }`}
        title={t("theme.dark")}
      >
        {t("theme.darkShort")}
      </button>
      <button
        type="button"
        onClick={() => setTheme("concrete")}
        className={`${
          compact
            ? "min-h-[36px] min-w-[2.4rem] px-2 py-1.5 text-[10px]"
            : "min-h-[40px] min-w-[2.75rem] px-3 py-2 text-[11px] sm:min-h-0 sm:min-w-0 sm:px-2.5 sm:py-1 sm:text-[10px]"
        } rounded-full font-semibold transition-colors ${
          themeId === "concrete"
            ? "bg-primary text-black"
            : "text-bh-faint hover:text-bh-text"
        }`}
        title={t("theme.concrete")}
      >
        {t("theme.concreteShort")}
      </button>
    </div>
  );
}
