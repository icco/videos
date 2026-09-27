import { SiteHeader } from "@icco/react-common/SiteHeader"

import { site } from "@/lib/site"

export function Header() {
  return <SiteHeader links={site.navigation} />
}
