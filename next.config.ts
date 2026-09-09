import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The domain layer is plain TypeScript with no bundler-specific features.
  // Nothing here should ever need to know about it.
  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;
