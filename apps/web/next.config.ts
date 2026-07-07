import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  reactStrictMode: true,
  turbopack: {
    root: workspaceRoot
  },
  transpilePackages: ["@agentic-csv/infrastructure"]
};

export default nextConfig;
