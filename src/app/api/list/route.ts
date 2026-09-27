import { videoBucket, videoPrefix, videoUrl } from "../../../lib/storage.ts"
import { VIDEO_TYPES, videoExtension } from "../../../lib/videos.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [files] = await videoBucket().getFiles({
      autoPaginate: true,
      prefix: videoPrefix(),
    })
    const videos = files
      .filter((file) => VIDEO_TYPES[videoExtension(file.name)])
      .sort((a, b) => b.name.localeCompare(a.name))
      .map((file) => videoUrl(file.name))
    return Response.json(
      { videos },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("Video listing failed:", error)
    return Response.json(
      { message: "Unable to load videos. Please try again." },
      { status: 500 }
    )
  }
}
