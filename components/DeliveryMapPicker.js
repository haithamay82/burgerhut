import { useEffect, useRef, useState } from "react";
import {
  DELIVERY_VILLAGES,
} from "@/utils/deliveryPricing";
import { DELIVERY_VILLAGE_BORDERS } from "@/utils/deliveryVillageBorders";

const STREET_TILES = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  options: {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
};

const SATELLITE_TILES = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  options: {
    attribution:
      "Tiles &copy; Esri — Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
};

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
  prefillLat,
  prefillLng,
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
  const streetLayerRef = useRef(null);
  const satelliteLayerRef = useRef(null);
  const prefillRef = useRef({ lat: prefillLat, lng: prefillLng });
  prefillRef.current = { lat: prefillLat, lng: prefillLng };
  const [picked, setPicked] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const [mapMode, setMapMode] = useState("street");

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
      setMapMode("street");
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

      const streetLayer = L.tileLayer(STREET_TILES.url, STREET_TILES.options);
      const satelliteLayer = L.tileLayer(
        SATELLITE_TILES.url,
        SATELLITE_TILES.options
      );
      streetLayer.addTo(map);
      streetLayerRef.current = streetLayer;
      satelliteLayerRef.current = satelliteLayer;

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

      const start = prefillRef.current;
      const startLat = Number(start?.lat);
      const startLng = Number(start?.lng);
      if (Number.isFinite(startLat) && Number.isFinite(startLng)) {
        if (markerLayerRef.current) {
          map.removeLayer(markerLayerRef.current);
        }
        markerLayerRef.current = L.marker([startLat, startLng]).addTo(map);
        map.setView([startLat, startLng], 16);
        setPicked({ lat: startLat, lng: startLng });
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
      streetLayerRef.current = null;
      satelliteLayerRef.current = null;
    };
  }, [open, centerLat, centerLng, zoom, locale]);

  useEffect(() => {
    if (!open || !mapRef.current) return;
    const lat = Number(prefillLat);
    const lng = Number(prefillLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setPicked({ lat, lng });
    placeMarker(lat, lng);
  }, [open, prefillLat, prefillLng]);

  const switchMapMode = (mode) => {
    const map = mapRef.current;
    const street = streetLayerRef.current;
    const satellite = satelliteLayerRef.current;
    if (!map || !street || !satellite || mapMode === mode) return;
    if (mode === "satellite") {
      if (map.hasLayer(street)) map.removeLayer(street);
      if (!map.hasLayer(satellite)) satellite.addTo(map);
      satellite.bringToBack();
    } else {
      if (map.hasLayer(satellite)) map.removeLayer(satellite);
      if (!map.hasLayer(street)) street.addTo(map);
      street.bringToBack();
    }
    setMapMode(mode);
  };

  const useMyLocation = (e) => {
    e?.preventDefault?.();
    if (isApplying || locating) return;
    setLocateError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateError(labels.locateUnsupported || "");
      return;
    }
    setLocating(true);

    const deniedText = () =>
      (labels.locateDenied || "").replace(
        "{host}",
        typeof window !== "undefined" ? window.location.hostname : ""
      );

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

    const onError = (err) => {
      const code = Number(err?.code);
      if (code === 3) {
        navigator.geolocation.getCurrentPosition(
          applyPosition,
          (retryErr) => {
            setLocating(false);
            const retryCode = Number(retryErr?.code);
            if (retryCode === 1) {
              setLocateError(deniedText());
            } else if (retryCode === 3) {
              setLocateError(labels.locateTimeout || "");
            } else {
              setLocateError(labels.locateUnavailable || "");
            }
          },
          {
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 60000,
          }
        );
        return;
      }
      setLocating(false);
      if (code === 1) {
        setLocateError(deniedText());
      } else {
        setLocateError(labels.locateUnavailable || "");
      }
    };

    navigator.geolocation.getCurrentPosition(applyPosition, onError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    });
  };

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[600] flex items-end justify-center px-3 pb-3 pt-16 sm:items-center ${
        locating ? "bg-black/35" : "bg-bh-overlay"
      }`}
      role="dialog"
      aria-modal={!locating}
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
        <div className="relative min-h-[min(50vh,320px)] w-full flex-1 border-y border-bh-border">
          <div
            ref={containerRef}
            className="relative z-0 h-full min-h-[min(50vh,320px)] w-full"
            style={{ minHeight: "min(50vh, 360px)" }}
          />
          <div className="pointer-events-auto absolute right-2 top-2 z-[500] flex overflow-hidden rounded-lg border border-bh-border-strong bg-bh-card/95 shadow-lg backdrop-blur-sm">
            <button
              type="button"
              onClick={() => switchMapMode("street")}
              className={`px-2.5 py-1.5 text-[11px] font-bold ${
                mapMode === "street"
                  ? "bg-primary text-black"
                  : "text-bh-muted hover:bg-bh-elevated hover:text-bh-text"
              }`}
            >
              {labels.mapStreet || "מפה"}
            </button>
            <button
              type="button"
              onClick={() => switchMapMode("satellite")}
              className={`px-2.5 py-1.5 text-[11px] font-bold ${
                mapMode === "satellite"
                  ? "bg-primary text-black"
                  : "text-bh-muted hover:bg-bh-elevated hover:text-bh-text"
              }`}
            >
              {labels.mapSatellite || "לוויין"}
            </button>
          </div>
        </div>
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
