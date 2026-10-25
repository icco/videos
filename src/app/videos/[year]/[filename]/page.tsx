import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"

import { getVideo } from "@/lib/storage"
import { formatBytes, formatDuration, videoMetadata } from "@/lib/videos"

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
  return videoMetadata(filename, video)
}

export default async function VideoPage({ params }: Props) {
  const encoded = await params
  // Next 16.3 passes encoded page params, while metadata params are decoded.
  const year = decodeURIComponent(encoded.year)
  const filename = decodeURIComponent(encoded.filename)
  const video = await findVideo(year, filename)
  const metadata = video.metadata

  return (
    <>
      <Link href="/" className="link">
        Back to videos
      </Link>
      <h1 className="mt-6 mb-4 text-2xl font-bold break-words sm:text-3xl">
        {filename}
      </h1>
      {metadata?.summary && (
        <p className="mb-4 text-base-content/80">{metadata.summary}</p>
      )}
      <video
        controls
        playsInline
        preload="metadata"
        poster={video.posterUrl}
        src={video.url}
        aria-label={filename}
        className="aspect-video w-full rounded-lg bg-black"
      >
        Your browser does not support video playback. Use the link below to open
        the file.
      </video>
      {metadata && (
        <section aria-labelledby="video-details" className="mt-6">
          <h2 id="video-details" className="mb-3 text-lg font-semibold">
            Details
          </h2>
          {metadata.tags.length > 0 && (
            <ul className="mb-4 flex flex-wrap gap-2" aria-label="Tags">
              {metadata.tags.map((tag) => (
                <li key={tag} className="badge badge-outline">
                  {tag}
                </li>
              ))}
            </ul>
          )}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-base-content/60">Original file</dt>
              <dd className="break-all">{metadata.originalName}</dd>
            </div>
            <div>
              <dt className="text-base-content/60">Duration</dt>
              <dd>{formatDuration(metadata.durationSeconds)}</dd>
            </div>
            <div>
              <dt className="text-base-content/60">Resolution</dt>
              <dd>
                {metadata.width} × {metadata.height}
              </dd>
            </div>
            <div>
              <dt className="text-base-content/60">Codecs</dt>
              <dd>
                {metadata.audioCodec
                  ? `${metadata.videoCodec} / ${metadata.audioCodec}`
                  : metadata.videoCodec}
              </dd>
            </div>
            <div>
              <dt className="text-base-content/60">Size</dt>
              <dd>{formatBytes(metadata.sizeBytes)}</dd>
            </div>
          </dl>
        </section>
      )}
      <p className="mt-4">
        <a href={video.url} className="link" target="_blank" rel="noreferrer">
          Open video file
        </a>
      </p>
    </>
  )
}
