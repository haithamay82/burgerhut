/**
 * בונה גבולות משלוח מגבולות מנהליים של OSM (מועצה מקומית), לא מקו הבינוי.
 * יאנוח וגת הן מועצה אחת במפה (yanuh_jat); המחיר נקבע לפי הכפר הקרוב.
 */
const fs = require("fs");
const path = require("path");

function roundCoord(n) {
  return Math.round(Number(n) * 1e5) / 1e5;
}

function roundRing(ring) {
  const out = ring.map((p) => [roundCoord(p[0]), roundCoord(p[1])]);
  const a = out[0];
  const b = out[out.length - 1];
  if (!a || !b || a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]);
  return out;
}

function roundGeometry(geometry) {
  if (!geometry) return geometry;
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map(roundRing),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((poly) => poly.map(roundRing)),
    };
  }
  return geometry;
}

const NAME_TO_ID = {
  يركا: "yarka",
  جولس: "julis",
  "أبو سنان": "abu_snan",
  "كفر ياسيف": "kfar_yasif",
};

const src = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, "village-admin.json"), "utf8")
);

const features = [];
for (const f of src.features || []) {
  const name = f.properties?.name || "";
  const id = NAME_TO_ID[name];
  if (id) {
    features.push({
      type: "Feature",
      properties: { id },
      geometry: roundGeometry(f.geometry),
    });
    continue;
  }
  if (name.includes("يانوح") || name.toLowerCase().includes("jatt")) {
    features.push({
      type: "Feature",
      properties: { id: "yanuh_jat" },
      geometry: roundGeometry(f.geometry),
    });
  }
}

const order = ["yarka", "julis", "abu_snan", "kfar_yasif", "yanuh_jat"];
features.sort(
  (a, b) => order.indexOf(a.properties.id) - order.indexOf(b.properties.id)
);

if (features.length !== 5) {
  console.error(
    "expected 5 features, got",
    features.map((x) => x.properties.id)
  );
  process.exit(1);
}

const collection = { type: "FeatureCollection", features };
const outPath = path.join(__dirname, "..", "utils", "deliveryVillageBorders.js");
const body =
  "/** OSM administrative local-council outlines (includes industrial land within the council). */\n" +
  "export const DELIVERY_VILLAGE_BORDERS = " +
  JSON.stringify(collection) +
  ";\n";
fs.writeFileSync(outPath, body, "utf8");
console.log("wrote", outPath, "features", features.map((x) => x.properties.id).join(","));
