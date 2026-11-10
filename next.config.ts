import type { NextConfig } from "next";

// A deliberately conservative set: no script-src, so Next's inline bootstrap keeps
// working, while framing, MIME sniffing, referrer leakage and powerful browser APIs
// are all locked down.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  // Docker images set NEXT_STANDALONE=1 so the runner stage only needs the traced
  // files. Local builds keep the regular .next layout for `next start`.
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  poweredByHeader: false,
  devIndicators: false,
  // The database lives in ./data at runtime; never trace it into the build output.
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./.next/cache/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
