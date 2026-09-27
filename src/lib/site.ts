import type { NavLink } from "@icco/react-common/SiteHeader"

// Customize this file when creating a site.
export const site = {
  name: "Next.js starter",
  description: "A small beginning for your next idea.",
  url: "https://example.com",
  repository: "https://github.com/icco/nextjs-template",
  navigation: [{ name: "Home", href: "/" }] satisfies NavLink[],
  // Set to your reportd path (e.g. /analytics/my-site) to enable Web Vitals.
  analyticsPath: "",
  footer: {
    showRecurseCenter: true,
    showPrivacyPolicy: true,
    // Social includes /feed.rss; enable after adding a feed to your project.
    showSocial: false,
    // The shared rings use natwelch.com's membership IDs and fetch remote data.
    showRecurseRing: false,
    showXXIIVVRing: false,
  },
} as const
