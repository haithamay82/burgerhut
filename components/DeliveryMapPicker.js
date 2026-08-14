import { useEffect, useRef, useState } from "react";

/**
 * מודל מפה — בחירת נקודת יעד בלחיצה. רץ רק בצד הלקוח (טען עם dynamic ssr:false).
 */
export default function DeliveryMapPicker({
  open,
  onClose,
  centerLat,
  centerLng,
  zoom = 12,
  labels,
  isApplying,
  applyError,
  onConfirm,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const leafletRef = useRef(null);
  const [picked, setPicked] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");

  const placeMarker = (lat, lng) => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (markerLayerRef.current) {
      map.removeLayer(markerLayerRef.current);
    }
    markerLayerRef.current = L.marker([lat, lng]).addTo(map);
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
  };

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setLocating(false);
      setLocateError("");
      return;
    }

    let cancelled = false;
    let map = null;

    (async () => {
      await import("leaflet/dist/leaflet.css");
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;

      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      map = L.map(containerRef.current, {
        scrollWheelZoom: true,
      }).setView([centerLat, centerLng], zoom);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      map.on("click", (e) => {
        const { lat, lng } = e.latlng;
        setLocateError("");
        setPicked({ lat, lng });
        if (markerLayerRef.current) {
          map.removeLayer(markerLayerRef.current);
        }
        markerLayerRef.current = L.marker([lat, lng]).addTo(map);
      });

      mapRef.current = map;
      setTimeout(() => {
        if (map && !cancelled) map.invalidateSize();
      }, 280);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerLayerRef.current = null;
      leafletRef.current = null;
    };
  }, [open, centerLat, centerLng, zoom]);

  const useMyLocation = () => {
    if (isApplying || locating) return;
    setLocateError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateError(labels.locateUnsupported || "");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos?.coords?.latitude);
        const lng = Number(pos?.coords?.longitude);
        setLocating(false);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setLocateError(labels.locateUnavailable || "");
          return;
        }
        setPicked({ lat, lng });
        placeMarker(lat, lng);
      },
      (err) => {
        setLocating(false);
        const code = Number(err?.code);
        if (code === 1) {
          setLocateError(labels.locateDenied || "");
        } else if (code === 3) {
          setLocateError(labels.locateTimeout || "");
        } else {
          setLocateError(labels.locateUnavailable || "");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[600] flex items-end justify-center bg-bh-overlay p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-map-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-bh-border-strong bg-bh-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-bh-border px-3 py-2">
          <h2
            id="delivery-map-title"
            className="text-sm font-bold text-primary"
          >
            {labels.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-lg leading-none text-bh-faint hover:bg-bh-elevated hover:text-bh-text"
            aria-label={labels.cancel}
          >
            ×
          </button>
        </div>
        <p className="px-3 py-2 text-[11px] leading-snug text-bh-faint">
          {labels.hint}
        </p>
        <div className="px-3 pb-2">
          <button
            type="button"
            disabled={isApplying || locating}
            onClick={useMyLocation}
            className="w-full rounded-xl border border-primary/70 bg-primary/10 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {locating ? labels.locating : labels.useMyLocation}
          </button>
          {locateError ? (
            <p className="mt-2 text-[11px] leading-snug text-amber-200/90">
              {locateError}
            </p>
          ) : null}
        </div>
        <div
          ref={containerRef}
          className="relative z-0 min-h-[min(50vh,320px)] w-full flex-1 border-y border-bh-border"
          style={{ minHeight: "min(50vh, 360px)" }}
        />
        {applyError ? (
          <p className="px-3 py-2 text-[11px] text-red-400">{applyError}</p>
        ) : null}
        <div className="flex gap-2 p-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-bh-border-strong py-2 text-xs font-semibold text-bh-muted hover:bg-bh-elevated"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            disabled={!picked || isApplying}
            onClick={() => {
              if (!picked) return;
              onConfirm(picked.lat, picked.lng);
            }}
            className="btn-primary flex-1 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApplying ? labels.applying : labels.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
