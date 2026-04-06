/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: "/admin",
        destination: "/admin/orders",
        permanent: false,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.burgerhut.co.il" }],
        destination: "https://burgerhut.co.il/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

