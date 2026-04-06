/** מטא־Open Graph משותף ל־_document, _app ודפים — כתובת מוחלטת לווטסאפ/פייסבוק */

export const SITE_URL = String(
  process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://www.burgerhut.co.il"
).replace(/\/+$/, "");

export const OG_SHARE_IMAGE_PATH = "/og-share.png";

export const OG_IMAGE_URL = `${SITE_URL}${OG_SHARE_IMAGE_PATH}`;

export const OG_TITLE = "Burger Hut בורגר האט";

export const OG_DESCRIPTION =
  "מסעדת בורגר וקריספי משלוחים ואיסוף עצמי ירכא והסביבה";

export const OG_IMAGE_WIDTH = "1200";
export const OG_IMAGE_HEIGHT = "630";
