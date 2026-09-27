import type { NextConfig } from "next"

import { site } from "./src/lib/site"

const isDevelopment = process.env.NODE_ENV === "development"
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js static rendering embeds inline hydration scripts. Use nonces if
  // switching to a stricter CSP with dynamic rendering.
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `media-src 'self' ${new URL(process.env.VIDEO_PUBLIC_BASE_URL || "https://storage.googleapis.com").origin}`,
  `connect-src 'self'${site.analyticsPath ? " https://reportd.natwelch.com" : ""}${isDevelopment ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep the GCS authentication stack unbundled on Node 26, as in photos.
  serverExternalPackages: ["@google-cloud/storage"],
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/about",
        destination: "https://natwelch.com/wiki/about",
        permanent: true,
      },
      {
        source: "/privacy",
        destination: "https://natwelch.com/wiki/privacy-policy",
        permanent: true,
      },
      {
        source: "/feed.rss",
        destination: site.feedUrl,
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ]
  },
}

export default nextConfig
