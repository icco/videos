import { registerOTel } from "@vercel/otel"

export async function register() {
  registerOTel({ serviceName: "videos" })

  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { startVideoWorker } = await import("./lib/jobs")
    startVideoWorker()
  }
}
