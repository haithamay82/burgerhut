/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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

