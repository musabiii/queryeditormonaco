import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Для Docker: .next/standalone с server.js и только нужными файлами node_modules.
  output: "standalone",
};

export default nextConfig;
