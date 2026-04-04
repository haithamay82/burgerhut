import { useEffect, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

export default function HomeMediaSlider() {
  const { t } = useLocale();
  const [images, setImages] = useState([]);

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

  if (!images.length) return null;

  return (
    <section
      className="mb-3"
      aria-label={t("home.sliderAria")}
    >
      <div
        dir="ltr"
        className="flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] snap-x snap-mandatory"
        style={{ scrollBehavior: "smooth" }}
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
