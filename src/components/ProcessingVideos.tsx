"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import type { VideoJob } from "@/lib/videos"

export function ProcessingVideos({ refreshKey }: { refreshKey: number }) {
  const router = useRouter()
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let previous: string | undefined
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const response = await fetch("/api/jobs", { signal: controller.signal })
        if (!response.ok) throw new Error("Unable to load processing status.")
        const { jobs: updated } = (await response.json()) as {
          jobs: VideoJob[]
        }
        const current = JSON.stringify(updated)
        if (current !== previous) router.refresh()
        previous = current
        setJobs(updated)
        setError(null)
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load processing status."
          )
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 5000)
      }
    }
    void refresh()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [router, refreshKey])

  async function retry(id: string) {
    setRetrying(id)
    try {
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(id)}/retry`,
        { method: "POST" }
      )
      if (!response.ok) throw new Error("Unable to retry processing.")
      setJobs((jobs) =>
        jobs.map((job) => (job.id === id ? { ...job, status: "queued" } : job))
      )
      setError(null)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to retry processing."
      )
    } finally {
      setRetrying(null)
    }
  }

  return (
    <>
      {error && (
        <p role="alert" className="mt-4 text-error">
          {error}
        </p>
      )}
      {jobs.length > 0 && (
        <section aria-labelledby="processing-videos" className="my-8">
          <h2 id="processing-videos" className="mb-4 text-xl font-semibold">
            Processing uploads
          </h2>
          <p className="mb-4 text-sm opacity-75">
            You can close this page. Processing continues in the background.
          </p>
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center gap-2">
                <span className="break-all">{job.name}</span>
                <span className="badge">{job.status}</span>
                {job.status === "failed" && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={retrying !== null}
                    onClick={() => retry(job.id)}
                    aria-label={`Retry ${job.name}`}
                  >
                    {retrying === job.id ? "Retrying…" : "Retry"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
