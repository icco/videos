import Link from "next/link"

export default function NotFound() {
  return (
    <div className="grid place-content-center gap-6 py-12 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <Link className="link" href="/">
        Back home
      </Link>
    </div>
  )
}
