import { listVideos } from "../../../lib/storage.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const videos = await listVideos()
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
