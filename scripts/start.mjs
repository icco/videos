import { cp } from "node:fs/promises"

// Next.js intentionally leaves these out of standalone output. Mirror Docker's
// COPY steps so local production checks exercise the same server as deployment.
await cp("public", ".next/standalone/public", { recursive: true })
await cp(".next/static", ".next/standalone/.next/static", { recursive: true })
process.env.PORT ||= "8080"
process.env.HOSTNAME = "0.0.0.0"
await import("../.next/standalone/server.js")
