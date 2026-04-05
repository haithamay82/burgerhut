import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}

export default function HomeMediaSlider({
  initialImages = [],
  initialVersion = 0,
}) {
  const { t } = useLocale();
  const [images, setImages] = useState(() =>
    Array.isArray(initialImages) ? [...initialImages] : []
  );
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    setImages(Array.isArray(initialImages) ? [...initialImages] : []);
  }, [initialVersion, initialImages]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const bust = `${Date.now()}-${initialVersion}`;
        const r = await fetch(`/api/home-slider?_=${encodeURIComponent(bust)}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });
        const d = await r.json().catch(() => ({}));
        if (cancelled || !r.ok || !d?.ok || !Array.isArray(d.images)) {
          return;
        }
        setImages(d.images);
      } catch {
        /* שומרים תמונות מ-getServerSideProps אם ה-fetch נכשל */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [initialVersion]);

  const loopImages = useMemo(() => [...images, ...images], [images]);

  /** משך קצר יותר = מרקיז מהיר יותר (חצי מהערכים הקודמים ≈ פי 2 במהירות) */
  const animationDurationSec = useMemo(() => {
    const n = images.length;
    if (n <= 0) return 10;
    return Math.min(21, Math.max(5, n * 3));
  }, [images.length]);

  if (!images.length) return null;

  if (reduceMotion) {
    return (
      <section
        className="mb-3 min-w-0 w-full max-w-full"
        dir="ltr"
        aria-label={t("home.sliderAria")}
      >
        <div className="flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] snap-x snap-mandatory">
          {images.map((img) => (
            <img
              key={img.id}
              src={img.url}
              alt=""
              className="h-44 w-[min(88vw,22rem)] shrink-0 snap-center rounded-xl border border-slate-700 object-cover shadow-lg"
              loading="lazy"
              decoding="async"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className="mb-3 min-w-0 w-full max-w-full"
      dir="ltr"
      aria-label={t("home.sliderAria")}
    >
      <div className="overflow-hidden pb-2 [-webkit-overflow-scrolling:touch]">
        <div
          className="home-slider-marquee-right flex w-max gap-3"
          style={{
            animationDuration: `${animationDurationSec}s`,
          }}
        >
          {loopImages.map((img, i) => (
            <img
              key={`${img.id}-${i}`}
              src={img.url}
              alt=""
              className="h-44 w-[min(88vw,22rem)] shrink-0 rounded-xl border border-slate-700 object-cover shadow-lg"
              loading="eager"
              decoding="async"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
