"use client"

import { useRouter } from "next/navigation"
import { type FormEvent, useRef, useState } from "react"

import { ProcessingVideos } from "@/components/ProcessingVideos"
import { validateVideos, VIDEO_ACCEPT, VIDEO_SIZE_LIMIT } from "@/lib/videos"

export function VideoUploader() {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadVersion, setUploadVersion] = useState(0)
  const [notice, setNotice] = useState<{
    message: string
    error: boolean
  } | null>(null)

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (uploading) return
    const files = Array.from(fileInput.current?.files || [])
    const message = validateVideos(files)
    if (message) {
      setNotice({ message, error: true })
      return
    }
    setNotice(null)
    setUploading(true)
    const body = new FormData()
    files.forEach((file) => body.append("video", file))
    try {
      const response = await fetch("/api/upload", { method: "POST", body })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || "Upload failed.")
      setNotice({
        message: `Uploaded ${result.jobs.length} video(s). Processing continues in the background; you can close this page.`,
        error: false,
      })
      if (fileInput.current) fileInput.current.value = ""
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : "Upload failed. Please try again.",
        error: true,
      })
    } finally {
      setUploading(false)
      setUploadVersion((version) => version + 1)
      router.refresh()
    }
  }

  return (
    <>
      <form
        onSubmit={upload}
        className="flex flex-col gap-4"
        aria-busy={uploading}
      >
        <label htmlFor="videos" className="font-semibold">
          Choose videos
        </label>
        <input
          id="videos"
          name="video"
          type="file"
          multiple
          accept={VIDEO_ACCEPT}
          ref={fileInput}
          disabled={uploading}
          aria-describedby="upload-help"
          className="file-input w-full"
        />
        <p id="upload-help" className="text-sm opacity-75">
          MP4, M4V, WebM, MOV, OGV, or MKV. Up to 10 files and{" "}
          {VIDEO_SIZE_LIMIT} per batch. Every video is automatically converted
          to WebM (AV1/Opus) in the background after uploading. You can close
          this page once the upload is confirmed.
        </p>
        <button
          type="submit"
          disabled={uploading}
          className="btn self-start btn-primary"
        >
          {uploading ? "Uploading…" : "Upload videos"}
        </button>
      </form>
      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`my-4 rounded border p-3 ${notice.error ? "border-error" : "border-success"}`}
        >
          {notice.message}
        </p>
      )}
      <ProcessingVideos refreshKey={uploadVersion} />
    </>
  )
}
