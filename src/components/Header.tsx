import Logo from "@icco/react-common/Logo"
import { SiteHeader } from "@icco/react-common/SiteHeader"
import Link from "next/link"

import { site } from "@/lib/site"

export function Header() {
  return (
    <SiteHeader
      links={site.navigation}
      brand={
        <Link
          href="/"
          aria-label={`${site.name} home`}
          className="flex items-center gap-3 font-semibold"
        >
          <span aria-hidden="true">
            <Logo size={40} className="stroke-current" />
          </span>
          <span>{site.name}</span>
        </Link>
      }
    />
  )
}
