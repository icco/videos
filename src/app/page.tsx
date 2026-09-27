import { VideoGallery } from "@/components/VideoGallery"

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold">Videos</h1>
      <p className="mb-6">Upload, watch, and share your videos.</p>
      <VideoGallery />
    </div>
  )
}
