/**
 * א) q=כתובת → גיאוקוד → זיהוי יישוב
 * ב) lat+lon (או lng) → זיהוי יישוב מדמי משלוח לפי טבלת כפרים
 */
import { findDeliveryVillage } from "@/utils/deliveryPricing";

/** גבולות משוערים לישראל + סביבה קרובה */
function inServiceBounds(lat, lon) {
  return lat >= 29.2 && lat <= 33.8 && lon >= 33.5 && lon <= 36.3;
}

/** Next.js לפעמים מחזיר מחרוזת או מערך לפרמטרי query */
function firstQueryValue(raw) {
  if (raw === undefined || raw === null || raw === "") return "";
  if (Array.isArray(raw)) return String(raw[0] ?? "").trim();
  return String(raw).trim();
}

function parseCoord(raw) {
  const s = firstQueryValue(raw);
  if (!s) return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

/** מסיר רק «נפת …» (מבלבל ללקוחות); משאיר מחוז, ישראל ושאר השרשרת מ-display_name */
function simplifyNominatimDisplayName(displayName) {
  if (!displayName || typeof displayName !== "string") return displayName || "";
  const parts = displayName.split(",").map((s) => s.trim()).filter(Boolean);
  const kept = parts.filter((part) => !/^נפת\s+/u.test(part));
  return kept.length ? kept.join(", ") : displayName.trim();
}

const NOMINATIM_ROAD_KEYS = [
  "road",
  "pedestrian",
  "residential",
  "footway",
  "path",
  "cycleway",
  "steps",
  "living_street",
  "unclassified",
];

const NOMINATIM_LOCALITY_KEYS = [
  "neighbourhood",
  "suburb",
  "quarter",
  "village",
  "hamlet",
  "town",
  "city",
  "municipality",
];

/** כשיש שם כזה — נחשב לכתובת מספיק ספציפית בלי להדביק קואורדינטות */
const NOMINATIM_POI_TYPES = new Set([
  "building",
  "amenity",
  "shop",
  "tourism",
  "historic",
  "leisure",
  "office",
]);

function firstNominatimAddressField(addr, keys) {
  if (!addr || typeof addr !== "object") return "";
  for (const k of keys) {
    const v = addr[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickStr(v) {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

function trimCountryFromFormattedAddress(full) {
  if (!full || typeof full !== "string") return "";
  return full
    .trim()
    .replace(/,?\s*ישראל\s*$/u, "")
    .replace(/,?\s*Israel\s*$/i, "")
    .trim();
}

/**
 * גיאוקוד הפוך ב-Google (אופציונלי) — בישראל לרוב כתובת קריאה כמו בווייז.
 * הגדרה בשרת בלבד: GOOGLE_MAPS_API_KEY או GOOGLE_GEOCODING_API_KEY (הגבלת מפתח ל-Geocoding API).
 */
async function googleReverseFormattedLabel(lat, lon) {
  const key =
    process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key || typeof key !== "string" || !String(key).trim()) return null;
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=` +
      `${encodeURIComponent(`${lat},${lon}`)}` +
      `&language=iw&key=${encodeURIComponent(String(key).trim())}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "BurgerHutOrdering/1.0" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (
      data.status !== "OK" ||
      !Array.isArray(data.results) ||
      !data.results[0]
    ) {
      return null;
    }
    const texts = [];
    for (const result of data.results.slice(0, 4)) {
      if (typeof result?.formatted_address === "string") {
        texts.push(result.formatted_address);
      }
      const comps = Array.isArray(result?.address_components)
        ? result.address_components
        : [];
      for (const c of comps) {
        if (typeof c?.long_name === "string") texts.push(c.long_name);
        if (typeof c?.short_name === "string") texts.push(c.short_name);
      }
    }
    const formatted = data.results[0].formatted_address;
    const label =
      typeof formatted === "string" && formatted.trim()
        ? trimCountryFromFormattedAddress(formatted)
        : "";
    return { label, texts };
  } catch {
    return null;
  }
}

/**
 * גיאוקוד הפוך נוסף (Photon / OSM) — לעיתים מחזיר רחוב כש־Nominatim מחזיר רק יישוב.
 */
async function photonReverseParts(lat, lon) {
  try {
    const url =
      `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}&lang=he`;
    const r = await fetch(url, {
      headers: { "User-Agent": "BurgerHutOrdering/1.0" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const f = data?.features?.[0]?.properties;
    if (!f || typeof f !== "object") return null;

    const hn = pickStr(f.housenumber);
    const street = pickStr(f.street);
    const name = pickStr(f.name);

    let streetLine = "";
    if (street && hn) streetLine = `${street} ${hn}`;
    else if (street) streetLine = street;

    const locality =
      pickStr(f.city) ||
      pickStr(f.town) ||
      pickStr(f.village) ||
      pickStr(f.district) ||
      "";

    let fallbackName = "";
    if (!streetLine && name) {
      if (f.type === "street" || f.osm_key === "highway") {
        streetLine = hn ? `${name} ${hn}` : name;
      } else if (locality && name !== locality) {
        fallbackName = hn ? `${name} ${hn}` : name;
      } else if (!locality) {
        fallbackName = hn ? `${name} ${hn}` : name;
      }
    }

    return { streetLine, locality, fallbackName };
  } catch {
    return null;
  }
}

function collectNominatimTexts(data) {
  const texts = [];
  if (typeof data?.display_name === "string") texts.push(data.display_name);
  if (typeof data?.name === "string") texts.push(data.name);
  const addr = data && typeof data.address === "object" ? data.address : null;
  if (addr) {
    for (const v of Object.values(addr)) {
      if (typeof v === "string" && v.trim()) texts.push(v.trim());
    }
  }
  return texts;
}

/** בונה תווית מ־Nominatim; מעדיף display_name המלא (רחוב/יישוב/מחוז/ישראל) ולא רק שם יישוב */
function buildReverseLabelFromNominatim(data) {
  const addr = data && typeof data.address === "object" ? data.address : null;
  const roadFromAddr = firstNominatimAddressField(addr, NOMINATIM_ROAD_KEYS);
  const hnRaw =
    addr && typeof addr.house_number === "string"
      ? addr.house_number.trim()
      : "";

  let line1 = "";
  if (roadFromAddr && hnRaw) line1 = `${roadFromAddr} ${hnRaw}`;
  else if (roadFromAddr) line1 = roadFromAddr;
  else if (hnRaw) line1 = hnRaw;

  let fromPoi = false;
  if (
    !line1 &&
    typeof data?.name === "string" &&
    data.name.trim() &&
    NOMINATIM_POI_TYPES.has(data.type)
  ) {
    const loc = firstNominatimAddressField(addr, NOMINATIM_LOCALITY_KEYS);
    if (!loc || data.name.trim() !== loc) {
      line1 = data.name.trim();
      fromPoi = true;
    }
  }

  const dnRaw = typeof data?.display_name === "string" ? data.display_name : "";
  let label = dnRaw ? simplifyNominatimDisplayName(dnRaw) || dnRaw.trim() : "";

  if (!label) {
    const locality = firstNominatimAddressField(addr, NOMINATIM_LOCALITY_KEYS);
    const parts = [];
    if (line1) parts.push(line1);
    if (locality && (!line1 || !line1.includes(locality))) parts.push(locality);
    label = parts.join(", ");
  }

  const hasPreciseLabel = Boolean(roadFromAddr) || Boolean(fromPoi);

  return { label: label.trim(), hasPreciseLabel };
}

async function fetchNominatimReverse(lat, lon) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}` +
      `&zoom=18&addressdetails=1&accept-language=he,ar,en`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "BurgerHutOrdering/1.0",
        "Accept-Language": "he,ar,en",
      },
    });
    if (r.ok) return await r.json();
  } catch {
    /* ignore */
  }
  return null;
}

async function resolvePinContext(lat, lon) {
  const texts = [];
  const [google, data] = await Promise.all([
    googleReverseFormattedLabel(lat, lon),
    fetchNominatimReverse(lat, lon),
  ]);
  if (google?.texts?.length) texts.push(...google.texts);
  if (google?.label) texts.push(google.label);

  if (data && typeof data === "object") {
    texts.push(...collectNominatimTexts(data));
  }

  const nom =
    data && typeof data === "object"
      ? buildReverseLabelFromNominatim(data)
      : { label: "", hasPreciseLabel: false };

  let label = google?.label
    ? (simplifyNominatimDisplayName(google.label) || google.label).trim()
    : nom.label;
  let precise = Boolean(google?.label) || nom.hasPreciseLabel;

  const p = await photonReverseParts(lat, lon);
  if (p?.locality) texts.push(p.locality);
  if (p?.streetLine) texts.push(p.streetLine);
  if (p?.fallbackName) texts.push(p.fallbackName);

  if (!precise) {
    if (p?.streetLine) {
      const loc =
        p.locality ||
        (data?.address
          ? firstNominatimAddressField(data.address, NOMINATIM_LOCALITY_KEYS)
          : "");
      const core = p.streetLine;
      label = loc && !core.includes(loc) ? `${core}, ${loc}` : core;
      precise = true;
    } else if (p?.fallbackName) {
      const loc =
        p.locality ||
        (data?.address
          ? firstNominatimAddressField(data.address, NOMINATIM_LOCALITY_KEYS)
          : "");
      const n = p.fallbackName;
      label = loc && !n.includes(loc) ? `${n}, ${loc}` : n;
      precise = true;
    }
  }

  label = (simplifyNominatimDisplayName(label) || label).trim();

  if (!label && typeof data?.name === "string" && data.name.trim()) {
    label = data.name.trim();
  }

  /** ללא קואורדינטות בממשק — רק טקסט קריא; קואורדינטות נשמרות בנפרד ב־lat/lng בהזמנה */
  if (!label) {
    label =
      "נקודה מהמפה — נא לפרט רחוב, מספר בית והערות למשלוח בשדה ההערות למטה";
  }

  return { label, texts };
}

async function nominatimGeocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&q=${encodeURIComponent(
    q.trim()
  )}`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": "BurgerHutOrdering/1.0",
      "Accept-Language": "he,ar,en",
    },
  });
  if (!r.ok) return null;
  const data = await r.json();
  if (!Array.isArray(data) || !data[0]) return null;
  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const raw = data[0].display_name || "";
  return {
    lat,
    lon,
    displayName: simplifyNominatimDisplayName(raw) || raw,
  };
}

async function computeFromCoords(destLat, destLon) {
  const pin = await resolvePinContext(destLat, destLon);
  const village = findDeliveryVillage(destLat, destLon);

  if (!village) {
    return {
      ok: false,
      error: "unsupported_village",
      displayName: pin.label || "",
    };
  }

  return {
    ok: true,
    fee: village.fee,
    villageId: village.id,
    villageLabelHe: village.labelHe,
    villageLabelAr: village.labelAr,
    displayName: pin.label,
    routingMode: "village",
    km: null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const latRaw = req.query.lat;
    const lonRaw = req.query.lon ?? req.query.lng;

    const hadLatKey =
      latRaw !== undefined && latRaw !== null && firstQueryValue(latRaw) !== "";
    const hadLonKey =
      lonRaw !== undefined && lonRaw !== null && firstQueryValue(lonRaw) !== "";

    let lat = parseCoord(latRaw);
    let lon = parseCoord(lonRaw);

    if (hadLatKey || hadLonKey) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(200).json({ ok: false, error: "bad_coords" });
      }
      if (!inServiceBounds(lat, lon) && inServiceBounds(lon, lat)) {
        const t = lat;
        lat = lon;
        lon = t;
      }
      if (!inServiceBounds(lat, lon)) {
        return res
          .status(400)
          .json({ ok: false, error: "out_of_bounds" });
      }
      const result = await computeFromCoords(lat, lon);
      if (!result.ok) {
        return res.status(200).json({
          ok: false,
          error: result.error,
          displayName: result.displayName || "",
        });
      }
      return res.status(200).json({ ok: true, ...result });
    }

    const q = req.query.q;
    if (!q || typeof q !== "string" || q.trim().length < 4) {
      return res.status(400).json({ ok: false, error: "bad_query" });
    }

    const place = await nominatimGeocode(q);
    if (!place) {
      return res.status(200).json({ ok: false, error: "not_found" });
    }

    const result = await computeFromCoords(place.lat, place.lon);
    if (!result.ok) {
      return res.status(200).json({ ok: false, error: result.error });
    }

    return res.status(200).json({
      ok: true,
      ...result,
      displayName: result.displayName || place.displayName,
    });
  } catch {
    return res.status(500).json({ ok: false, error: "server" });
  }
}
