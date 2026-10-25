import type { Metadata } from "next"

import type { VideoRecord } from "./db.ts"
import { site } from "./site.ts"

export const VIDEO_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
  ".mkv": "video/matroska",
}

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
export const MAX_BATCH_BYTES = MAX_VIDEO_BYTES
export const VIDEO_SIZE_LIMIT = "2 GiB"
export const MAX_VIDEO_FILES = 10
export const VIDEO_ACCEPT = Object.keys(VIDEO_TYPES).join(",")

export function videoExtension(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase()
}

export function videoPath(year: string, filename: string): string | null {
  if (
    !/^\d{4}$/.test(year) ||
    !filename ||
    /[/\\]/.test(filename) ||
    filename.includes("\0") ||
    !VIDEO_TYPES[videoExtension(filename)]
  ) {
    return null
  }
  return `videos/${year}/${filename}`
}

export function videoPagePath(url: string): string {
  return `/videos/${new URL(url).pathname.split("/").slice(-2).join("/")}`
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, "0")
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secs}`
  }
  return `${minutes}:${secs}`
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB"]
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`
}

export function videoMetadata(
  filename: string,
  video: { url: string; metadata?: VideoRecord | null }
): Metadata {
  const url = new URL(videoPagePath(video.url), site.url).href
  const description =
    video.metadata?.summary || `Watch ${filename} on ${site.name}.`
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

export function validateVideos(
  files: Pick<File, "name" | "size">[]
): string | null {
  if (!files.length) return "Select at least one video."
  if (files.length > MAX_VIDEO_FILES)
    return "Upload at most 10 videos at a time."
  for (const file of files) {
    if (!VIDEO_TYPES[videoExtension(file.name)]) {
      return `${file.name}: use MP4, M4V, WebM, MOV, OGV, or MKV.`
    }
    if (!file.size) return `${file.name} is empty.`
    if (file.size > MAX_VIDEO_BYTES)
      return `${file.name} exceeds ${VIDEO_SIZE_LIMIT}.`
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) {
    return `Upload at most ${VIDEO_SIZE_LIMIT} in one batch.`
  }
  return null
}

export interface VideoJob {
  id: string
  name: string
  status: "queued" | "processing" | "failed"
}
