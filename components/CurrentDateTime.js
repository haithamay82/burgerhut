import { useEffect, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

const TZ = "Asia/Jerusalem";

/**
 * Live date + time for the active UI locale (he-IL / ar-IL), Jerusalem TZ.
 */
export default function CurrentDateTime({ className = "" }) {
  const { locale } = useLocale();
  const [now, setNow] = useState(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const tag = locale === "he" ? "he-IL" : "ar-IL";
  const line = new Intl.DateTimeFormat(tag, {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  return (
    <span className={`inline-block whitespace-nowrap tabular-nums ${className}`}>
      {line}
    </span>
  );
}
