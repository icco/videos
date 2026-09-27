import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"

import { site } from "@/lib/site"
import { getVideo } from "@/lib/storage"
import { videoPagePath } from "@/lib/videos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const findVideo = cache(async (year: string, filename: string) => {
  const video = await getVideo(year, filename)
  if (!video) notFound()
  return video
})

type Props = {
  params: Promise<{ year: string; filename: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year, filename } = await params
  const video = await findVideo(year, filename)
  const url = new URL(videoPagePath(video.url), site.url).href
  const description = `Watch ${filename} on ${site.name}.`
  return {
    title: filename,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "video.other",
      title: filename,
      description,
      url,
      siteName: site.name,
      videos: [{ url: video.url }],
    },
    twitter: { card: "summary", title: filename, description },
  }
}

export default async function VideoPage({ params }: Props) {
  const encoded = await params
  // Next 16.3 passes encoded page params, while metadata params are decoded.
  const year = decodeURIComponent(encoded.year)
  const filename = decodeURIComponent(encoded.filename)
  const video = await findVideo(year, filename)

  return (
    <>
      <Link href="/" className="link">
        Back to videos
      </Link>
      <h1 className="mt-6 mb-4 text-2xl font-bold break-words sm:text-3xl">
        {filename}
      </h1>
      <video
        controls
        playsInline
        preload="metadata"
        src={video.url}
        aria-label={filename}
        className="aspect-video w-full rounded-lg bg-black"
      >
        Your browser does not support video playback. Use the link below to open
        the file.
      </video>
      <p className="mt-4">
        <a href={video.url} className="link" target="_blank" rel="noreferrer">
          Open video file
        </a>
      </p>
    </>
  )
}
