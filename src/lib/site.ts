import { InformationCircleIcon } from "@heroicons/react/24/outline"
import type { NavLink } from "@icco/react-common/SiteHeader"
import { createElement } from "react"

export const site = {
  name: "Videos",
  description: "Upload, watch, and share videos.",
  url: "https://videos.natwelch.com",
  repository: "https://github.com/icco/videos",
  navigation: [
    {
      name: "About",
      href: "/about",
      prefetch: false,
      icon: createElement(InformationCircleIcon, { className: "h-5 w-5" }),
    },
  ] satisfies NavLink[],
  analyticsPath: "/analytics/videos",
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
