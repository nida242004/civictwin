import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // no floating dev badge in screenshots / video captures
  devIndicators: false,
  // browsers still probe /favicon.ico; serve the SVG shield instead of a 404
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/logo.svg" }];
  },
};

export default nextConfig;
