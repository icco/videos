import "./globals.css"

import { Footer } from "@icco/react-common/Footer"
import { ThemeProvider } from "@icco/react-common/ThemeProvider"
import { WebVitals } from "@icco/react-common/WebVitals"
import type { Metadata } from "next"
import { Roboto, Roboto_Mono, Roboto_Slab } from "next/font/google"
import type { ReactNode } from "react"

import { Header } from "@/components/Header"
import { site } from "@/lib/site"

const roboto = Roboto({
  weight: "400",
  variable: "--font-roboto",
  subsets: ["latin"],
  display: "swap",
})

const robotoSlab = Roboto_Slab({
  variable: "--font-roboto-slab",
  subsets: ["latin"],
  display: "swap",
})

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.description,
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    title: site.name,
    description: site.description,
    siteName: site.name,
  },
  twitter: { card: "summary", title: site.name, description: site.description },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${robotoSlab.variable} ${robotoMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col bg-base-100 font-sans text-base-content antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-base-100 focus:p-4"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <Header />
          {site.analyticsPath && (
            <WebVitals analyticsPath={site.analyticsPath} />
          )}
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-xl flex-1 px-4 py-8"
          >
            {children}
          </main>
          <Footer sourceRepo={site.repository} {...site.footer} />
        </ThemeProvider>
      </body>
    </html>
  )
}
