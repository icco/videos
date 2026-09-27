import { RecentVideoList } from "@/components/RecentVideoList"
import { VideoUploader } from "@/components/VideoUploader"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-2 text-3xl font-bold sm:text-5xl">Videos</h1>
      <p className="mb-6">Upload, watch, and share your videos.</p>
      <VideoUploader />
      <section className="mt-8" aria-labelledby="recent-videos">
        <h2 id="recent-videos" className="mb-4 text-xl font-semibold">
          This year’s videos
        </h2>
        <RecentVideoList />
      </section>
    </div>
  )
}
