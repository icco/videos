import { pipeline } from "node:stream/promises"

import { getTsid } from "tsid-ts"

import { videoBucket, videoPrefix, videoUrl } from "../../../lib/storage.ts"
import { withPreparedVideo } from "../../../lib/transcode.ts"
import { UploadError, withUploadedVideos } from "../../../lib/uploads.ts"
import { type UploadedVideo, VIDEO_TYPES } from "../../../lib/videos.ts"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const uploaded: UploadedVideo[] = []
  try {
    await withUploadedVideos(req, async (files) => {
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
    })
    return Response.json({ success: true, files: uploaded })
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ message: error.message }, { status: error.status })
    }
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
