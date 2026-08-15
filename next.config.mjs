/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "geolocation=(self)",
          },
        ],
      },
      {
        source: "/og-share.png",
        headers: [
          { key: "Content-Type", value: "image/png" },
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  // Avoid www↔apex redirects here: hosting often redirects the other way → loop (ERR_TOO_MANY_REDIRECTS).
  async redirects() {
    return [
      {
        source: "/admin",
        destination: "/admin/orders",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

