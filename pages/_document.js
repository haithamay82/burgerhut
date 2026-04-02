import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="he" dir="rtl">
      <Head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#f5a623" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/logo-burger-hut.png" />
      </Head>
      <body className="bg-black text-gray-100 font-sans">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

