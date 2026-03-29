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
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    if (!open) {
      setPicked(null);
      return;
    }

    let cancelled = false;
    let map = null;

    (async () => {
      await import("leaflet/dist/leaflet.css");
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

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
    };
  }, [open, centerLat, centerLng, zoom]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[600] flex items-end justify-center bg-black/80 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-map-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
          <h2
            id="delivery-map-title"
            className="text-sm font-bold text-primary"
          >
            {labels.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-lg leading-none text-gray-400 hover:bg-slate-800 hover:text-gray-200"
            aria-label={labels.cancel}
          >
            ×
          </button>
        </div>
        <p className="px-3 py-2 text-[11px] leading-snug text-gray-400">
          {labels.hint}
        </p>
        <div
          ref={containerRef}
          className="relative z-0 min-h-[min(50vh,320px)] w-full flex-1 border-y border-slate-800"
          style={{ minHeight: "min(50vh, 360px)" }}
        />
        {applyError ? (
          <p className="px-3 py-2 text-[11px] text-red-400">{applyError}</p>
        ) : null}
        <div className="flex gap-2 p-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-600 py-2 text-xs font-semibold text-gray-300 hover:bg-slate-800"
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
