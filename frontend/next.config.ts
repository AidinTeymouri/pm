import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
