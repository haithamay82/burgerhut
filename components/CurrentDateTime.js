import { useEffect, useState } from "react";

const TZ = "Asia/Jerusalem";

export default function CurrentDateTime({ className = "" }) {
  const [now, setNow] = useState(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const dateLine = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(now);
  const timeLine = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  return (
    <span className={`inline-flex flex-col tabular-nums ${className}`}>
      <span className="whitespace-nowrap">{dateLine}</span>
      <span className="whitespace-nowrap">{timeLine}</span>
    </span>
  );
}
