/**
 * תמונת שיתוף 1200×630 ל־Open Graph / ווטסאפ (מומלץ על ידי פייסבוק).
 */
const path = require("path");
const sharp = require("sharp");

const W = 1200;
const H = 630;
const SRC = path.join(__dirname, "..", "public", "logo-burger-hut.png");
const OUT = path.join(__dirname, "..", "public", "og-share.png");

(async () => {
  const logoBuf = await sharp(SRC)
    .rotate()
    .resize(520, 520, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 10, g: 10, b: 12 },
    },
  })
    .composite([{ input: logoBuf, gravity: "center" }])
    .png()
    .toFile(OUT);

  console.log("wrote public/og-share.png (%dx%d)", W, H);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
