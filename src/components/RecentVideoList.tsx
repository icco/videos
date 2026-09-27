"use client"

import { Loading } from "@icco/react-common/Loading"
import Link from "next/link"
import { useEffect, useState } from "react"

import { videoPagePath } from "@/lib/videos"

export function RecentVideoList() {
  const [videos, setVideos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch("/api/list", {
          signal: controller.signal,
          cache: "no-store",
        })
        const result = await response.json()
        if (!response.ok)
          throw new Error(result.message || "Unable to load videos.")
        if (
          !Array.isArray(result.videos) ||
          !result.videos.every((url: unknown) => typeof url === "string")
        ) {
          throw new Error("Received an invalid video list.")
        }
        setVideos(result.videos)
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Unable to load videos."
          )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [attempt])

  if (loading)
    return (
      <div role="status" className="flex items-center gap-2">
        <Loading size="sm" />
        <span>Loading videos…</span>
      </div>
    )
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button
          className="btn mt-2 btn-sm"
          onClick={() => {
            setError(null)
            setLoading(true)
            setAttempt((value) => value + 1)
          }}
        >
          Try again
        </button>
      </div>
    )
  if (!videos.length) return <p>No videos yet. Upload one to get started.</p>

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {videos.map((url) => {
        const name = decodeURIComponent(
          new URL(url).pathname.split("/").pop() || "Video"
        )
        return (
          <figure key={url} className="min-w-0 rounded-lg bg-base-200 p-3">
            <video
              controls
              playsInline
              preload="none"
              src={url}
              aria-label={name}
              className="aspect-video w-full rounded bg-black"
            >
              Your browser does not support video playback. Use the link below
              to open the file.
            </video>
            <figcaption className="mt-2 truncate text-sm">
              <Link href={videoPagePath(url)} className="link">
                Watch {name}
              </Link>
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}
