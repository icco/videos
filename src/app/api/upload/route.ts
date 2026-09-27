import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream } from "node:stream/web"

import { getTsid } from "tsid-ts"

import { videoBucket, videoPrefix, videoUrl } from "../../../lib/storage.ts"
import {
  MAX_BATCH_BYTES,
  type UploadedVideo,
  validateVideos,
  VIDEO_TYPES,
  videoExtension,
} from "../../../lib/videos.ts"

export const runtime = "nodejs"

export async function POST(req: Request) {
  // Allow multipart headers in addition to the media payload. Deployments should
  // also enforce this request limit at the ingress, including chunked requests.
  const length = Number(req.headers.get("content-length"))
  if (length > MAX_BATCH_BYTES + 1024 * 1024) {
    return Response.json(
      { message: "Upload at most 100 MiB in one batch." },
      { status: 413 }
    )
  }

  let data: FormData
  try {
    data = await req.formData()
  } catch {
    return Response.json(
      { message: "Send videos as multipart form data." },
      { status: 400 }
    )
  }
  const entries = data.getAll("video")
  if (entries.some((entry) => !(entry instanceof File))) {
    return Response.json(
      { message: "Each video must be a file." },
      { status: 400 }
    )
  }
  const files = entries as File[]
  const message = validateVideos(files)
  if (message) return Response.json({ message }, { status: 400 })

  const uploaded: UploadedVideo[] = []
  try {
    const bucket = videoBucket()
    for (const file of files) {
      const ext = videoExtension(file.name)
      const path = `${videoPrefix()}${getTsid().toString()}${ext}`
      await pipeline(
        Readable.fromWeb(file.stream() as ReadableStream<Uint8Array>),
        bucket.file(path).createWriteStream({
          resumable: true,
          metadata: {
            contentType: VIDEO_TYPES[ext],
            cacheControl: "public, max-age=31536000, immutable",
          },
        })
      )
      uploaded.push({ path, url: videoUrl(path) })
    }
    return Response.json({ success: true, files: uploaded })
  } catch (error) {
    console.error("Video upload failed:", error)
    return Response.json(
      {
        message: `Upload failed. ${uploaded.length} video(s) were saved; refresh the gallery before retrying.`,
        files: uploaded,
      },
      { status: 500 }
    )
  }
}
