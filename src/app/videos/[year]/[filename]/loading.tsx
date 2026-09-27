export default function LoadingVideo() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading video…</span>
      <div aria-hidden="true">
        <div className="h-6 w-28 skeleton" />
        <div className="mt-6 mb-4 h-9 w-3/4 skeleton sm:h-10" />
        <div className="aspect-video w-full skeleton rounded-lg" />
        <div className="mt-4 h-6 w-32 skeleton" />
      </div>
    </div>
  )
}
