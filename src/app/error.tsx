"use client"

import { ErrorMessage } from "@icco/react-common/ErrorMessage"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-20">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <div role="alert">
        <ErrorMessage
          error={error}
          message="We couldn't load this page. Please try again."
        />
      </div>
      <button type="button" className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  )
}
