"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

export function VideoListRetry() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div role="alert" aria-busy={pending}>
      <p>Unable to load videos. Please try again.</p>
      <button
        type="button"
        className="btn mt-2 btn-sm"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {pending ? "Retrying…" : "Try again"}
      </button>
    </div>
  )
}
