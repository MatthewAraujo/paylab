import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Playwright reaches the dev server as 127.0.0.1; without this its client bundles are blocked.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
