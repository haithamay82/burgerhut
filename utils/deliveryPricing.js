/**
 * מסעדה: ירכא 137. דמי משלוח לפי גבול יישוב במפה.
 */
import { DELIVERY_VILLAGE_BORDERS } from "@/utils/deliveryVillageBorders";
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

export const DELIVERY_VILLAGES = [
  {
    id: "yarka",
    fee: 25,
    labelHe: "ירכא",
    labelAr: "يركا",
    lat: 32.9533,
    lng: 35.2119,
    maxKm: 3.6,
    aliases: ["ירכא", "يركا", "yarka", "yirka", "yerka"],
  },
  {
    id: "julis",
    fee: 30,
    labelHe: "גוליס",
    labelAr: "جولس",
    lat: 32.9447,
    lng: 35.1861,
    maxKm: 2.4,
    aliases: ["גוליס", "גולס", "جولس", "julis", "joulis"],
  },
  {
    id: "abu_snan",
    fee: 35,
    labelHe: "אבו סנאן",
    labelAr: "أبو سنان",
    lat: 32.9578,
    lng: 35.1722,
    maxKm: 2.6,
    aliases: [
      "אבו סנאן",
      "אבו סנן",
      "أبو سنان",
      "abu snan",
      "abu sinan",
      "abu-sinan",
    ],
  },
  {
    id: "kfar_yasif",
    fee: 40,
    labelHe: "כפר יסיף",
    labelAr: "كفر ياسيف",
    lat: 32.9547,
    lng: 35.1653,
    maxKm: 2.4,
    aliases: [
      "כפר יסיף",
      "כפר יאסיף",
      "كفر ياسيف",
      "kafr yasif",
      "kfar yasif",
      "kfar yassif",
      "kafr yassif",
    ],
  },
  {
    id: "jat",
    fee: 35,
    labelHe: "גת",
    labelAr: "جت",
    lat: 32.9739,
    lng: 35.2331,
    maxKm: 2.2,
    aliases: ["גת", "جت", "jat", "jatt", "gath"],
  },
  {
    id: "yanuh",
    fee: 40,
    labelHe: "יאנוח",
    labelAr: "يانوح",
    lat: 32.9837,
    lng: 35.2519,
    maxKm: 2.6,
    aliases: ["יאנוח", "يانوح", "yanuh", "yanouh", "yanuh jat", "יאנוח גת"],
  },
];

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(lng, lat, coordinates) {
  if (!Array.isArray(coordinates) || !coordinates[0]) return false;
  const [outer, ...holes] = coordinates;
  if (!pointInRing(lng, lat, outer)) return false;
  for (const hole of holes) {
    if (pointInRing(lng, lat, hole)) return false;
  }
  return true;
}

function pointInGeometry(lng, lat, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    return pointInPolygonCoords(lng, lat, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((poly) =>
      pointInPolygonCoords(lng, lat, poly)
    );
  }
  return false;
}

export function feeForVillage(village, feesById) {
  if (!village) return null;
  const n = Number(feesById?.[village.id]);
  if (Number.isFinite(n) && n >= 0) return Math.round(n);
  const fallback = Number(village.fee);
  return Number.isFinite(fallback) ? Math.round(fallback) : null;
}

export const BORDER_VILLAGE_IDS = {
  yarka: ["yarka"],
  julis: ["julis"],
  abu_snan: ["abu_snan"],
  kfar_yasif: ["kfar_yasif"],
  jat: ["jat"],
  yanuh: ["yanuh"],
  yanuh_jat: ["jat", "yanuh"],
};

export function findVillageByPolygon(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const hits = [];
  const features = DELIVERY_VILLAGE_BORDERS?.features || [];
  for (const feat of features) {
    if (!pointInGeometry(lng, lat, feat.geometry)) continue;
    const ids = BORDER_VILLAGE_IDS[feat.properties?.id] || [feat.properties?.id];
    for (const id of ids) {
      const village = DELIVERY_VILLAGES.find((v) => v.id === id);
      if (village) hits.push(village);
    }
  }
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    return hits.reduce((best, village) => {
      const bestKm = haversineKm(lat, lng, best.lat, best.lng);
      const km = haversineKm(lat, lng, village.lat, village.lng);
      return km < bestKm ? village : best;
    });
  }
  return null;
}

/**
 * דמי משלוח לפי טבלה רק אם הנקודה בתוך גבול יישוב שסומן במפה.
 */
export function findDeliveryVillage(lat, lng) {
  return findVillageByPolygon(lat, lng);
}
