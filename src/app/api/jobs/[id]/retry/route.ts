import { retryVideoJob } from "../../../../../lib/jobs.ts"

export const runtime = "nodejs"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await retryVideoJob((await params).id))) {
      return Response.json(
        { message: "This video is not available to retry." },
        { status: 409 }
      )
    }
    return Response.json({ success: true }, { status: 202 })
  } catch (error) {
    console.error("Unable to retry video:", error)
    return Response.json(
      { message: "Unable to retry processing." },
      { status: 500 }
    )
  }
}
