import { Storage } from "@google-cloud/storage"

import { getVideoMetadata } from "./db.ts"
import {
  VIDEO_TYPES,
  videoExtension,
  videoPath,
  videoPosterPath,
} from "./videos.ts"

export function videoBucket() {
  return new Storage({
    projectId: process.env.GCP_PROJECT_ID || "icco-cloud",
  }).bucket(process.env.GCP_BUCKET_NAME || "icco-cloud")
}

export function videoUrl(path: string): string {
  const bucket = process.env.GCP_BUCKET_NAME || "icco-cloud"
  const base =
    process.env.VIDEO_PUBLIC_BASE_URL ||
    `https://storage.googleapis.com/${bucket}`
  return `${base.replace(/\/$/, "")}/${path.split("/").map(encodeURIComponent).join("/")}`
}

export function videoPrefix(): string {
  return `videos/${new Date().getUTCFullYear()}/`
}

export const VIDEO_QUEUE_PREFIX = "videos/pending/"

export async function listVideos(): Promise<string[]> {
  const [files] = await videoBucket().getFiles({
    autoPaginate: true,
    prefix: videoPrefix(),
  })
  return files
    .filter((file) => VIDEO_TYPES[videoExtension(file.name)])
    .sort((a, b) => b.name.localeCompare(a.name))
    .map((file) => videoUrl(file.name))
}

export async function getVideo(year: string, filename: string) {
  const path = videoPath(year, filename)
  if (!path) return null
  const posterPath = videoPosterPath(path)
  const bucket = videoBucket()
  const [[exists], [posterExists], metadata] = await Promise.all([
    bucket.file(path).exists(),
    bucket.file(posterPath).exists(),
    getVideoMetadata(path),
  ])
  if (!exists) return null
  return {
    path,
    url: videoUrl(path),
    ...(posterExists ? { posterUrl: videoUrl(posterPath) } : {}),
    ...(metadata ? { metadata } : {}),
  }
}
