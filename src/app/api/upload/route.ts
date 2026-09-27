import { queueVideo } from "../../../lib/jobs.ts"
import { UploadError, withUploadedVideos } from "../../../lib/uploads.ts"
import type { VideoJob } from "../../../lib/videos.ts"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const jobs: VideoJob[] = []
  try {
    await withUploadedVideos(req, async (files) => {
      for (const file of files) {
        jobs.push(await queueVideo(file, req.signal))
      }
    })
    return Response.json({ success: true, jobs }, { status: 202 })
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ message: error.message }, { status: error.status })
    }
    console.error("Video upload failed:", error)
    return Response.json(
      {
        message: `Upload failed. ${jobs.length} video(s) were queued for processing.`,
        jobs,
      },
      { status: 500 }
    )
  }
}
