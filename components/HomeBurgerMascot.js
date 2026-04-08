import { useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

/** שימו כאן קובץ GIF: public/home-burger-mascot.gif */
const MASCOT_SRC = "/home-burger-mascot.gif";

export default function HomeBurgerMascot({ className = "" }) {
  const { t } = useLocale();
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div
      className={`flex shrink-0 justify-center self-center sm:self-start ${className}`}
    >
      <img
        src={MASCOT_SRC}
        alt={t("home.burgerMascotAlt")}
        width={176}
        height={176}
        className="h-auto max-h-36 w-auto max-w-[min(11rem,42vw)] object-contain drop-shadow-[0_6px_24px_rgba(0,0,0,0.45)] sm:max-h-44 sm:max-w-[13.5rem]"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
