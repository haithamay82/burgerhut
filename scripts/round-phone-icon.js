/**
 * Build public/phone-icon.png: solid circular green (like Waze) + white handset only.
 * Source squircle: public/phone-handset-source.png (500×500). Run after editing source.
 * Usage: node scripts/round-phone-icon.js
 */
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const pub = path.join(__dirname, "../public");
const wazePath = path.join(pub, "waze-icon.png");
const handsetSourcePath = path.join(pub, "phone-handset-source.png");
const outPath = path.join(pub, "phone-icon.png");

function distRgb(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

async function main() {
  if (!fs.existsSync(handsetSourcePath)) {
    console.error("Missing", handsetSourcePath, "— add the squircle PNG (e.g. copy from git history).");
    process.exit(1);
  }

  const wazeMeta = await sharp(wazePath).metadata();
  const outW = wazeMeta.width || 494;
  const outH = wazeMeta.height || 505;
  const d = Math.min(outW, outH);
  const cx = outW / 2;
  const cy = outH / 2;
  const r = d / 2;

  const greenRef = { r: 58, g: 227, b: 76 };
  const { data, info } = await sharp(handsetSourcePath)
    .resize(outW, outH, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const handset = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const pr = data[i];
      const pg = data[i + 1];
      const pb = data[i + 2];
      const pa = data[i + 3];
      const dGreen = distRgb({ r: pr, g: pg, b: pb }, greenRef);
      const notGreen = smoothstep(42, 105, dGreen);
      if (notGreen < 0.001 || pa < 8) {
        handset[i] = handset[i + 1] = handset[i + 2] = handset[i + 3] = 0;
        continue;
      }
      const a = Math.round(pa * notGreen);
      const l = (pr + pg + pb) / 3;
      const whiteness = smoothstep(90, 210, l);
      const v = Math.round(200 + 55 * whiteness);
      handset[i] = v;
      handset[i + 1] = v;
      handset[i + 2] = v;
      handset[i + 3] = a;
    }
  }

  const green = { r: greenRef.r, g: greenRef.g, b: greenRef.b, alpha: 1 };
  const circleSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}">` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgb(${green.r},${green.g},${green.b})"/>` +
      `</svg>`
  );

  const handsetPng = await sharp(handset, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();

  await sharp(circleSvg)
    .composite([{ input: handsetPng, blend: "over" }])
    .png()
    .toFile(outPath + ".tmp");

  fs.renameSync(outPath + ".tmp", outPath);
  console.log("Wrote", outPath, `${outW}×${outH}, circular green + handset`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
