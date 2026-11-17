export async function register() {
  if (
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  ) {
    const { registerOTel } = await import("@vercel/otel")
    registerOTel({ serviceName: "videos" })
  }

  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { startVideoWorker } = await import("./lib/jobs")
    startVideoWorker()
  }
}
