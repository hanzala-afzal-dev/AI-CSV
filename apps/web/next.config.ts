import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const productionSecurityHeaders =
  process.env.NODE_ENV === "production"
    ? [
        {
          key: "Content-Security-Policy",
          value: contentSecurityPolicy(process.env.S3_PUBLIC_ENDPOINT)
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains"
        }
      ]
    : [];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  reactStrictMode: true,
  experimental: {
    // Bind-mounted source can leave persistent Turbopack route state stale after Docker restarts.
    turbopackFileSystemCacheForDev: false
  },
  turbopack: {
    root: workspaceRoot
  },
  transpilePackages: ["@agentic-csv/infrastructure"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          },
          ...productionSecurityHeaders
        ]
      }
    ];
  }
};

function contentSecurityPolicy(publicStorageEndpoint: string | undefined): string {
  const connectSources = ["'self'"];
  if (publicStorageEndpoint) {
    try {
      const endpoint = new URL(publicStorageEndpoint);
      if (["http:", "https:"].includes(endpoint.protocol)) {
        connectSources.push(endpoint.origin);
      }
    } catch {
      // Typed runtime configuration reports an invalid endpoint before serving requests.
    }
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:"
  ].join("; ");
}

export default nextConfig;
