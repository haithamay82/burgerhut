/**
 * מסעדה: ירכא 137 (קואורדינטות לנקודת המוצא של מסלול נסיעה).
 * haversineKm — גיבוי כשאין מסלול OSRM; דמי משלוח לפי ק״מ מ־/api/delivery-distance (ירכא ומחוץ לירכא).
 */
export const RESTAURANT_COORDS = { lat: 32.9519, lng: 35.2092 };

const R = 6371;

function toRad(d) {
  return (d * Math.PI) / 180;
}

/** מרחק אווירי בק״מ בין שתי נקודות WGS84 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * דמי משלוח מירכא 137 לפי מרחק נסיעה משוער (ק״מ מ־OSRM או גיבוי אווירי).
 * עד 5 ק״מ כולל → ₪25, מעל 5 עד 8 ק״מ כולל → ₪30, מעל 8 ק״מ → ₪40.
 * @param {number} km
 * @returns {number|null}
 */
export function deliveryFeeOutsideYarkaNis(km) {
  if (!Number.isFinite(km) || km < 0) return null;
  if (km <= 5) return 25;
  if (km <= 8) return 30;
  return 40;
}
