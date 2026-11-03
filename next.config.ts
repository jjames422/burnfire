import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Heroes renamed to match their in-game names.
      { source: "/heroes/brian", destination: "/heroes/ulfrid", permanent: true },
      { source: "/heroes/jester", destination: "/heroes/joker", permanent: true },
    ];
  },
};

export default nextConfig;
