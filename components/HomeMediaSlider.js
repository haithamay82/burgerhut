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

export default function HomeMediaSlider() {
  const { t } = useLocale();
  const [images, setImages] = useState([]);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/home-slider");
        const d = await r.json().catch(() => ({}));
        if (
          cancelled ||
          !r.ok ||
          !d?.ok ||
          !Array.isArray(d.images) ||
          !d.images.length
        ) {
          if (!cancelled) setImages([]);
          return;
        }
        setImages(d.images);
      } catch {
        if (!cancelled) setImages([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const loopImages = useMemo(() => [...images, ...images], [images]);

  const animationDurationSec = useMemo(() => {
    const n = images.length;
    if (n <= 0) return 40;
    return Math.min(90, Math.max(24, n * 14));
  }, [images.length]);

  if (!images.length) return null;

  if (reduceMotion) {
    return (
      <section
        className="mb-3"
        aria-label={t("home.sliderAria")}
      >
        <div
          dir="ltr"
          className="flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] snap-x snap-mandatory"
        >
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
      className="mb-3"
      aria-label={t("home.sliderAria")}
    >
      <div
        dir="ltr"
        className="overflow-hidden pb-2 [-webkit-overflow-scrolling:touch]"
      >
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
              loading={i < images.length ? "lazy" : "eager"}
              decoding="async"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
