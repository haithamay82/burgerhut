import { useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

/** קובץ ראשי: public/home-burger-mascot.gif (אנימציה). גיבוי: home-burger-mascot.png */
const MASCOT_SRCS = ["/home-burger-mascot.gif", "/home-burger-mascot.png"];

export default function HomeBurgerMascot({ className = "" }) {
  const { t } = useLocale();
  const [srcIndex, setSrcIndex] = useState(0);
  if (srcIndex >= MASCOT_SRCS.length) return null;
  const src = MASCOT_SRCS[srcIndex];
  return (
    <div
      className={`flex shrink-0 justify-center self-center sm:self-start ${className}`}
    >
      <img
        key={src}
        src={src}
        alt={t("home.burgerMascotAlt")}
        width={176}
        height={176}
        className="h-auto max-h-36 w-auto max-w-[min(11rem,42vw)] object-contain drop-shadow-[0_6px_24px_rgba(0,0,0,0.45)] sm:max-h-44 sm:max-w-[13.5rem]"
        loading="lazy"
        decoding="async"
        onError={() => setSrcIndex((i) => i + 1)}
      />
    </div>
  );
}
