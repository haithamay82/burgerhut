/**
 * דחיסה בצד לקוח לפני העלאת סליידר — פחות נתונים, פחות סיכון לביטול בקשה בנייד.
 * @param {File | Blob} file
 * @returns {Promise<Blob>}
 */
export async function prepareSliderImageForUpload(file) {
  if (!(file instanceof Blob)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height, 1));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob"))),
          "image/jpeg",
          0.82
        );
      });
      return blob;
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

export function blobToBase64PngOrJpeg(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
