/**
 * תמונת שיתוף 1200×630 ל־Open Graph / ווטסאפ.
 * JPEG שטוח (ללא שקיפות) — תאימות טובה יותר לבוטי פייסבוק/ווטסאפ מ-PNG מורכב.
 */
const path = require("path");
const sharp = require("sharp");

const W = 1200;
const H = 630;
const BG = { r: 10, g: 10, b: 12 };
const SRC = path.join(__dirname, "..", "public", "logo-burger-hut.png");
const OUT_PNG = path.join(__dirname, "..", "public", "og-share.png");
const OUT_JPG = path.join(__dirname, "..", "public", "og-share.jpg");

(async () => {
  const logoBuf = await sharp(SRC)
    .rotate()
    .resize(520, 520, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .toBuffer();

  const base = sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: BG,
    },
  })
    .composite([{ input: logoBuf, gravity: "center" }])
    .flatten({ background: BG });

  await base.clone().png({ compressionLevel: 9 }).toFile(OUT_PNG);
  await base
    .clone()
    .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toFile(OUT_JPG);

  console.log("wrote public/og-share.png + public/og-share.jpg (%dx%d)", W, H);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
