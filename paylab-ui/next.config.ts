import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Only the production image build sets this; `next build`/`next start` keep the default output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Playwright reaches the dev server as 127.0.0.1; without this its client bundles are blocked.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
