/**
 * אייקוני התקנה / PWA עם זום מרכזי תואם ל־Layout (scale-115 על הלוגו בעיגול).
 */
const path = require("path");
const sharp = require("sharp");

const ZOOM = 1.15;
const SRC = path.join(__dirname, "..", "public", "logo-burger-hut.png");
const OUT_DIR = path.join(__dirname, "..", "public");

async function makeIcon(outSize) {
  const inner = Math.round(outSize * ZOOM);
  const offset = Math.floor((inner - outSize) / 2);

  const squared = await sharp(SRC)
    .rotate()
    .resize(outSize, outSize, { fit: "cover", position: "center" })
    .toBuffer();

  await sharp(squared)
    .resize(inner, inner, { kernel: sharp.kernel.lanczos3 })
    .extract({ left: offset, top: offset, width: outSize, height: outSize })
    .png()
    .toFile(path.join(OUT_DIR, `pwa-icon-${outSize}.png`));

  console.log("wrote pwa-icon-%s.png", outSize);
}

(async () => {
  await makeIcon(180);
  await makeIcon(192);
  await makeIcon(512);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
