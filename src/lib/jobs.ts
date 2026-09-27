import { createReadStream, createWriteStream } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pipeline } from "node:stream/promises"
import { setTimeout as delay } from "node:timers/promises"

import type { File as StorageFile, FileMetadata } from "@google-cloud/storage"
import { getTsid } from "tsid-ts"

import { VIDEO_QUEUE_PREFIX, videoBucket, videoPrefix } from "./storage.ts"
import { withPreparedVideo } from "./transcode.ts"
import type { UploadedFile } from "./uploads.ts"
import { VIDEO_TYPES, videoExtension, type VideoJob } from "./videos.ts"

const LEASE_MS = 2 * 60 * 1000

function publicJob(file: StorageFile): VideoJob {
  return {
    id: file.name.slice(VIDEO_QUEUE_PREFIX.length),
    name: String(file.metadata.metadata?.originalName || file.name),
    status: file.metadata.metadata?.status as VideoJob["status"],
  }
}

export async function queueVideo(
  file: UploadedFile,
  signal?: AbortSignal
): Promise<VideoJob> {
  const id = getTsid().toString()
  const ext = videoExtension(file.name)
  const source = videoBucket().file(`${VIDEO_QUEUE_PREFIX}${id}${ext}`)
  await pipeline(
    createReadStream(file.path),
    source.createWriteStream({
      resumable: true,
      metadata: {
        contentType: VIDEO_TYPES[ext],
        cacheControl: "no-store",
        metadata: {
          status: "queued",
          originalName: file.name,
          outputPath: `${videoPrefix()}${id}.webm`,
        },
      },
    }),
    { signal }
  )
  return { id: `${id}${ext}`, name: file.name, status: "queued" }
}

async function pendingFiles() {
  const [files] = await videoBucket().getFiles({
    prefix: VIDEO_QUEUE_PREFIX,
    autoPaginate: true,
  })
  return files.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listVideoJobs(): Promise<VideoJob[]> {
  return (await pendingFiles()).map(publicJob)
}

export async function retryVideoJob(id: string): Promise<boolean> {
  if (!/^[0-9A-Z]{13}\.(mp4|m4v|mov|webm|ogv|mkv)$/.test(id)) return false
  const file = videoBucket().file(`${VIDEO_QUEUE_PREFIX}${id}`)
  try {
    const [metadata] = await file.getMetadata()
    if (metadata.metadata?.status !== "failed") return false
    await file.setMetadata(
      { metadata: { ...metadata.metadata, status: "queued", leaseUntil: "0" } },
      { ifMetagenerationMatch: metadata.metageneration }
    )
    return true
  } catch (error) {
    if ([404, 412].includes(Number((error as { code?: number }).code)))
      return false
    throw error
  }
}

async function processVideo(file: StorageFile, shutdown?: AbortSignal) {
  let metadata: FileMetadata
  try {
    const [claimed] = await file.setMetadata(
      {
        metadata: {
          ...file.metadata.metadata,
          status: "processing",
          leaseUntil: String(Date.now() + LEASE_MS),
        },
      },
      { ifMetagenerationMatch: file.metadata.metageneration }
    )
    metadata = claimed
  } catch (error) {
    if ([404, 412].includes(Number((error as { code?: number }).code))) return
    throw error
  }

  const lease = new AbortController()
  const signal = shutdown
    ? AbortSignal.any([shutdown, lease.signal])
    : lease.signal
  let updates = Promise.resolve()
  const heartbeat = setInterval(() => {
    updates = updates
      .then(async () => {
        const [renewed] = await file.setMetadata(
          {
            metadata: {
              ...metadata.metadata,
              leaseUntil: String(Date.now() + LEASE_MS),
            },
          },
          { ifMetagenerationMatch: metadata.metageneration }
        )
        metadata = renewed
      })
      .catch((error) => lease.abort(error))
  }, 30000)
  let directory: string | undefined
  try {
    directory = await mkdtemp(join(tmpdir(), "videos-job-"))
    const input = join(directory, "input")
    await pipeline(file.createReadStream(), createWriteStream(input), {
      signal,
    })
    await withPreparedVideo(
      {
        path: input,
        name: String(metadata.metadata?.originalName),
        size: Number(metadata.size),
      },
      async (stream) => {
        await pipeline(
          stream,
          videoBucket()
            .file(String(metadata.metadata?.outputPath))
            .createWriteStream({
              resumable: true,
              metadata: {
                contentType: "video/webm",
                cacheControl: "public, max-age=31536000, immutable",
              },
            }),
          { signal }
        )
      },
      signal
    )
    clearInterval(heartbeat)
    await updates
    signal.throwIfAborted()
    await file.delete({ ifMetagenerationMatch: metadata.metageneration })
  } catch (error) {
    clearInterval(heartbeat)
    await updates
    console.error("Video processing failed:", error)
    // An interrupted or expired lease is recovered by a later worker pass.
    if (!signal.aborted) {
      await file.setMetadata(
        {
          metadata: { ...metadata.metadata, status: "failed", leaseUntil: "0" },
        },
        { ifMetagenerationMatch: metadata.metageneration }
      )
    }
  } finally {
    clearInterval(heartbeat)
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}

export async function processPendingVideos(signal?: AbortSignal) {
  for (const file of await pendingFiles()) {
    signal?.throwIfAborted()
    const metadata = file.metadata.metadata
    if (
      metadata?.status === "queued" ||
      (metadata?.status === "processing" &&
        Number(metadata.leaseUntil || 0) < Date.now())
    ) {
      await processVideo(file, signal)
    }
  }
}

export function startVideoWorker() {
  const state = globalThis as typeof globalThis & {
    videoWorkerStarted?: boolean
  }
  if (state.videoWorkerStarted) return
  state.videoWorkerStarted = true
  const shutdown = new AbortController()
  process.once("SIGTERM", () => shutdown.abort())
  process.once("SIGINT", () => shutdown.abort())
  void (async () => {
    while (!shutdown.signal.aborted) {
      try {
        await processPendingVideos(shutdown.signal)
      } catch (error) {
        if (!shutdown.signal.aborted)
          console.error("Video worker failed:", error)
      }
      await delay(5000, undefined, {
        signal: shutdown.signal,
        ref: false,
      }).catch(() => {})
    }
  })()
}
