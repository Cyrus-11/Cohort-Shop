import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Keep a small, predictable image cache on development machines.
    maximumDiskCacheSize: 1_000_000,
  },
};

export default nextConfig;
