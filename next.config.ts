import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The legacy domain must not serve the site: sign-in and passkeys are
      // bound to the burnfire2.com origins, so requests there would be refused.
      {
        source: "/:path*",
        has: [{ type: "host", value: "(?:www\\.)?lastasylumplague\\.org" }],
        destination: "https://www.burnfire2.com/:path*",
        permanent: true,
      },
      // Heroes renamed to match their in-game names.
      { source: "/heroes/brian", destination: "/heroes/ulfrid", permanent: true },
      { source: "/heroes/jester", destination: "/heroes/joker", permanent: true },
    ];
  },
};

export default nextConfig;
