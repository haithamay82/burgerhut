import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

const SKIP_KEY = "bh_promo_skip_version";

export default function PromoVideoOverlay() {
  const { t } = useLocale();
  const videoRef = useRef(null);
  const [show, setShow] = useState(false);
  const [src, setSrc] = useState(null);
  const [version, setVersion] = useState(0);
  /** Must start muted or browsers block autoplay; tap video to turn sound on. */
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/promo");
        const d = await r.json().catch(() => ({}));
        if (cancelled || !r.ok || !d.active || !d.videoUrl) return;
        if (typeof window === "undefined") return;
        const skipped = window.sessionStorage.getItem(SKIP_KEY);
        if (skipped && String(d.version) === skipped) return;
        const v = Number(d.version) || 0;
        setMuted(true);
        setSrc(`${d.videoUrl}?v=${v}`);
        setVersion(v);
        setShow(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SKIP_KEY, String(version));
    }
    setShow(false);
    setSrc(null);
    setMuted(true);
  }, [version]);

  const enableSound = useCallback(() => {
    if (!muted) return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    setMuted(false);
    el.play().catch(() => {});
  }, [muted]);

  if (!show || !src) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={t("home.promoAria")}
    >
      <div
        className={`relative min-h-0 flex-1 touch-manipulation bg-black ${
          muted ? "cursor-pointer" : "cursor-default"
        }`}
        onClick={enableSound}
        onKeyDown={
          muted
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  enableSound();
                }
              }
            : undefined
        }
        role={muted ? "button" : undefined}
        tabIndex={muted ? 0 : undefined}
        aria-label={muted ? t("home.promoTapForSound") : undefined}
      >
        <video
          ref={videoRef}
          className="pointer-events-none h-full w-full object-contain"
          src={src}
          autoPlay
          muted={muted}
          playsInline
          controls={false}
          onEnded={dismiss}
        />
      </div>
      <div className="flex shrink-0 justify-center border-t border-slate-800 bg-black/90 py-4">
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-black shadow-lg transition hover:brightness-110"
        >
          {t("home.promoSkip")}
        </button>
      </div>
    </div>
  );
}
