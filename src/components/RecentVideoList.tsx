import Link from "next/link"

import { VideoListRetry } from "@/components/VideoListRetry"
import { listVideos } from "@/lib/storage"
import { videoPagePath } from "@/lib/videos"

export async function RecentVideoList() {
  let videos: string[]
  try {
    videos = await listVideos()
  } catch (error) {
    console.error("Video listing failed:", error)
    return <VideoListRetry />
  }

  if (!videos.length) return <p>No videos yet. Upload one to get started.</p>

  return (
    <ul className="divide-y divide-base-300">
      {videos.map((url) => {
        const name = decodeURIComponent(
          new URL(url).pathname.split("/").pop() || "Video"
        )
        return (
          <li key={url} className="py-3">
            <Link href={videoPagePath(url)} className="link break-all">
              {name}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
