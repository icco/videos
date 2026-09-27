import type { Metadata } from "next"

import { site } from "@/lib/site"

export const metadata: Metadata = { alternates: { canonical: "/" } }

export default function Home() {
  return (
    <div className="grid place-items-center px-6 py-20">
      <div className="max-w-2xl space-y-6 text-center">
        <p className="badge badge-outline">Made with care</p>
        <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
          {site.name}
        </h1>
        <p className="text-xl text-base-content/70">{site.description}</p>
        <p className="text-sm text-base-content/60">
          Something lovely is on its way.
        </p>
      </div>
    </div>
  )
}
