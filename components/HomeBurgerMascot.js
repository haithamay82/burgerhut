import { useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

/** קובץ ראשי: public/home-burger-mascot.gif (אנימציה). גיבוי: home-burger-mascot.png */
const MASCOT_SRCS = ["/home-burger-mascot.gif", "/home-burger-mascot.png"];

/** ריבוע קטן בשורה עם הטקסט (למשל אחרי ❤ בכותרת הבית) */
export default function HomeBurgerMascot({ className = "" }) {
  const { t } = useLocale();
  const [srcIndex, setSrcIndex] = useState(0);
  if (srcIndex >= MASCOT_SRCS.length) return null;
  const src = MASCOT_SRCS[srcIndex];
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 align-middle overflow-hidden rounded-md ring-1 ring-white/20 sm:h-9 sm:w-9 ${className}`}
    >
      <img
        key={src}
        src={src}
        alt={t("home.burgerMascotAlt")}
        width={36}
        height={36}
        className="pointer-events-none h-full w-full select-none object-cover"
        loading="eager"
        decoding="async"
        onError={() => setSrcIndex((i) => i + 1)}
      />
    </span>
  );
}
