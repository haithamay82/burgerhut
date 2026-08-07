import { Html, Head, Main, NextScript } from "next/document";
import {
  CANONICAL_SITE_URL,
  OG_DESCRIPTION,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_TYPE,
  OG_IMAGE_URL,
  OG_IMAGE_WIDTH,
  OG_TITLE,
} from "@/lib/siteOg";

export default function Document() {
  const themeBootScript = `(function(){try{var k='bh_theme_customer_v1';var t=localStorage.getItem(k);if(t!=='dark'&&t!=='concrete'){var m=document.cookie.match(/(?:^|; )bh_theme_site_v1=([^;]*)/);t=m?decodeURIComponent(m[1]):'dark';}if(t!=='dark'&&t!=='concrete')t='dark';var d=document.documentElement;d.setAttribute('data-theme',t);d.style.colorScheme=t==='concrete'?'light':'dark';}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

  return (
    <Html lang="he" dir="rtl">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#f5a623" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" sizes="180x180" href="/pwa-icon-180.png" />
        <link rel="canonical" href={CANONICAL_SITE_URL} />
        <link rel="image_src" href={OG_IMAGE_URL} />
        <meta name="description" content={OG_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Burger Hut" />
        <meta property="og:locale" content="he_IL" />
        <meta property="og:url" content={CANONICAL_SITE_URL} />
        <meta property="og:title" content={OG_TITLE} />
        <meta property="og:description" content={OG_DESCRIPTION} />
        <meta property="og:image" content={OG_IMAGE_URL} />
        <meta property="og:image:secure_url" content={OG_IMAGE_URL} />
        <meta property="og:image:type" content={OG_IMAGE_TYPE} />
        <meta property="og:image:width" content={OG_IMAGE_WIDTH} />
        <meta property="og:image:height" content={OG_IMAGE_HEIGHT} />
        <meta property="og:image:alt" content={OG_TITLE} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={OG_TITLE} />
        <meta name="twitter:description" content={OG_DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE_URL} />
      </Head>
      <body className="bg-bh-bg text-bh-text font-sans">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

