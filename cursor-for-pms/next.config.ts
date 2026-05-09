import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/signin", destination: "/sign-in", permanent: true },
      { source: "/signup", destination: "/sign-up", permanent: true },
      { source: "/login",  destination: "/sign-in", permanent: true },
    ];
  },
};

export default nextConfig;
