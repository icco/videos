import { Loading } from "@icco/react-common/Loading"

export default function LoadingPage() {
  return (
    <div role="status" className="flex justify-center px-6 py-20">
      <Loading />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
