import { listVideoJobs } from "../../../lib/jobs.ts"

export const runtime = "nodejs"

export async function GET() {
  try {
    return Response.json(
      { jobs: await listVideoJobs() },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("Unable to list video jobs:", error)
    return Response.json(
      { message: "Unable to load processing status." },
      { status: 500 }
    )
  }
}
