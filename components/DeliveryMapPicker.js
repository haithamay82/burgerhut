import { useEffect, useRef, useState } from "react";
import {
  DELIVERY_VILLAGES,
} from "@/utils/deliveryPricing";
import { DELIVERY_VILLAGE_BORDERS } from "@/utils/deliveryVillageBorders";

const VILLAGE_BORDER_COLORS = {
  yarka: "#22c55e",
  julis: "#38bdf8",
  abu_snan: "#f59e0b",
  kfar_yasif: "#a78bfa",
  jat: "#f472b6",
  yanuh: "#fb7185",
};

/**
 * מודל מפה — בחירת נקודת יעד בלחיצה. רץ רק בצד הלקוח (טען עם dynamic ssr:false).
 */
export default function DeliveryMapPicker({
  open,
  onClose,
  centerLat,
  centerLng,
  zoom = 12,
  locale = "he",
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

      const borders = L.geoJSON(DELIVERY_VILLAGE_BORDERS, {
        style: (feat) => {
          const color =
            VILLAGE_BORDER_COLORS[feat?.properties?.id] || "#fbbf24";
          return {
            color,
            weight: 2.5,
            fillColor: color,
            fillOpacity: 0.2,
          };
        },
        onEachFeature: (feat, layer) => {
          const village = DELIVERY_VILLAGES.find(
            (v) => v.id === feat?.properties?.id
          );
          if (!village) return;
          const name = locale === "ar" ? village.labelAr : village.labelHe;
          layer.bindTooltip(`${name} · ₪${village.fee}`, {
            sticky: true,
            direction: "center",
            opacity: 0.95,
          });
        },
      }).addTo(map);

      try {
        const b = borders.getBounds();
        if (b && b.isValid()) {
          map.fitBounds(b, { padding: [18, 18], maxZoom: 13 });
        }
      } catch {
        /* keep default center */
      }

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
  }, [open, centerLat, centerLng, zoom, locale]);

  const useMyLocation = (e) => {
    e?.preventDefault?.();
    if (isApplying || locating) return;
    setLocateError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateError(labels.locateUnsupported || "");
      return;
    }
    setLocating(true);

    const applyPosition = (pos) => {
      const lat = Number(pos?.coords?.latitude);
      const lng = Number(pos?.coords?.longitude);
      setLocating(false);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setLocateError(labels.locateUnavailable || "");
        return;
      }
      setPicked({ lat, lng });
      placeMarker(lat, lng);
    };

    navigator.geolocation.getCurrentPosition(
      applyPosition,
      (err) => {
        if (Number(err?.code) === 1) {
          setLocating(false);
          setLocateError(labels.locateDenied || "");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          applyPosition,
          () => {
            setLocating(false);
            setLocateError(labels.locateDenied || "");
          },
          {
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 0,
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
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
