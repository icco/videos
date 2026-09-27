import { VideoGallery } from "@/components/VideoGallery"

export default function Home() {
  return (
    <>
      <h1 className="mb-2 text-3xl font-bold sm:text-5xl">Videos</h1>
      <p className="mb-6">Upload, watch, and share your videos.</p>
      <VideoGallery />
    </>
  )
}
