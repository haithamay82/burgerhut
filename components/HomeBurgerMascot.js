import { useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

/** קובץ ראשי: public/home-burger-mascot.gif (אנימציה). גיבוי: home-burger-mascot.png */
const MASCOT_SRCS = ["/home-burger-mascot.gif", "/home-burger-mascot.png"];

/**
 * @param {{ className?: string; size?: "inline" | "titleBlock" }} props
 * inline — ריבוע קטן בשורה. titleBlock — ריבוע בגובה צמוד לבלוק טקסט (שורות הכותרת).
 */
export default function HomeBurgerMascot({
  className = "",
  size = "inline",
}) {
  const { t } = useLocale();
  const [srcIndex, setSrcIndex] = useState(0);
  if (srcIndex >= MASCOT_SRCS.length) return null;
  const src = MASCOT_SRCS[srcIndex];
  const isBlock = size === "titleBlock";
  return (
    <span
      className={
        isBlock
          ? `aspect-square shrink-0 self-stretch overflow-hidden rounded-md ring-1 ring-white/20 ${className}`
          : `inline-flex h-8 w-8 shrink-0 align-middle overflow-hidden rounded-md ring-1 ring-white/20 sm:h-9 sm:w-9 ${className}`
      }
    >
      <img
        key={src}
        src={src}
        alt={t("home.burgerMascotAlt")}
        width={isBlock ? 100 : 36}
        height={isBlock ? 100 : 36}
        className="pointer-events-none h-full w-full select-none object-cover"
        loading="eager"
        decoding="async"
        onError={() => setSrcIndex((i) => i + 1)}
      />
    </span>
  );
}
