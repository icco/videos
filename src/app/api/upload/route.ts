import { pipeline } from "node:stream/promises"

import { getTsid } from "tsid-ts"

import { videoBucket, videoPrefix, videoUrl } from "../../../lib/storage.ts"
import { withPreparedVideo } from "../../../lib/transcode.ts"
import {
  MAX_BATCH_BYTES,
  type UploadedVideo,
  validateVideos,
  VIDEO_TYPES,
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
      await withPreparedVideo(
        file,
        async (stream, ext) => {
          const path = `${videoPrefix()}${getTsid().toString()}${ext}`
          await pipeline(
            stream,
            bucket.file(path).createWriteStream({
              resumable: true,
              metadata: {
                contentType: VIDEO_TYPES[ext],
                cacheControl: "public, max-age=31536000, immutable",
              },
            }),
            { signal: req.signal }
          )
          uploaded.push({ path, url: videoUrl(path) })
        },
        req.signal
      )
    }
    return Response.json({ success: true, files: uploaded })
  } catch (error) {
    console.error("Video upload failed:", error)
    return Response.json(
      {
        message: `Video processing or upload failed. ${uploaded.length} video(s) were saved; refresh the gallery before retrying.`,
        files: uploaded,
      },
      { status: 500 }
    )
  }
}
