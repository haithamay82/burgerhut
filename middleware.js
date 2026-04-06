import { NextResponse } from "next/server";
import { isLinkPreviewCrawler } from "@/lib/linkPreviewBots";

const WWW_HOST = "www.burgerhut.co.il";
const APEX_ORIGIN = "https://burgerhut.co.il";

function isWwwHost(hostHeader) {
  if (!hostHeader) return false;
  const host = hostHeader.split(":")[0].toLowerCase();
  return host === WWW_HOST;
}

/**
 * - תמיד: אותו HTML מ-_document ל-www ול-apex (OG + canonical קבועים ב-lib/siteOg.js).
 * - אם ENABLE_WWW_TO_APEX_REDIRECT=1: דפדפנים ב-www מקבלים 308 ל-apex; בוטי תצוגה נשארים ב-200
 *   כדי שווטסאפ שלא עוקב אחרי redirect עדיין יקראו meta.
 * - ברירת מחדל ללא env: אין redirect באפליקציה (מונע לולאה מול redirect ב-Vercel/DNS).
 */
export function middleware(request) {
  if (!isWwwHost(request.headers.get("host"))) {
    return NextResponse.next();
  }

  const ua = request.headers.get("user-agent") || "";

  if (isLinkPreviewCrawler(ua)) {
    const res = NextResponse.next();
    res.headers.set("Vary", "User-Agent");
    return res;
  }

  if (process.env.ENABLE_WWW_TO_APEX_REDIRECT !== "1") {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(`${APEX_ORIGIN}${pathname}${search}`, 308);
}

export const config = {
  matcher: [
    // אל תיגע בקבצי public סטטיים (במיוחד תמונת OG — ווטסאפ/פייסבוק מבקשים ישירות)
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|og-share\\.png|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|json)$).*)",
  ],
};
