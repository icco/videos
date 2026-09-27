import assert from "node:assert/strict"
import { Readable, Writable } from "node:stream"
import { beforeEach, mock, test } from "node:test"

import { createVideo, probeVideo } from "./media.mjs"

let writes = []
let listed = []
let listingOptions
let failWrite = 0
let failList = false
let lookedUp = []
let failLookup = false
const objects = new Map()

function storageError(code) {
  return Object.assign(new Error(`Storage error ${code}`), { code })
}

function storageFile(path) {
  return {
    name: path,
    metadata: structuredClone(objects.get(path)?.metadata || {}),
    async exists() {
      lookedUp.push(path)
      if (failLookup) throw new Error("Storage unavailable")
      return [objects.has(path) || listed.some((file) => file.name === path)]
    },
    async getMetadata() {
      if (!objects.has(path)) throw storageError(404)
      this.metadata = structuredClone(objects.get(path).metadata)
      return [this.metadata]
    },
    async setMetadata(update, options) {
      const object = objects.get(path)
      if (!object) throw storageError(404)
      if (options.ifMetagenerationMatch !== object.metadata.metageneration)
        throw storageError(412)
      object.metadata = {
        ...object.metadata,
        ...update,
        metageneration: String(Number(object.metadata.metageneration) + 1),
      }
      this.metadata = structuredClone(object.metadata)
      return [this.metadata]
    },
    async delete(options) {
      const object = objects.get(path)
      if (!object) throw storageError(404)
      if (options.ifMetagenerationMatch !== object.metadata.metageneration)
        throw storageError(412)
      objects.delete(path)
    },
    createReadStream() {
      return Readable.from(objects.get(path).bytes)
    },
    createWriteStream(options) {
      const write = { path, options, chunks: [] }
      writes.push(write)
      return new Writable({
        write(chunk, encoding, callback) {
          if (writes.length === failWrite)
            return callback(new Error("Storage unavailable"))
          write.chunks.push(chunk)
          callback()
        },
        final(callback) {
          const bytes = Buffer.concat(write.chunks)
          const metadata = {
            ...options.metadata,
            name: path,
            size: bytes.length,
            metageneration: "1",
          }
          objects.set(path, { bytes, metadata: structuredClone(metadata) })
          callback()
        },
      })
    },
  }
}

mock.module("@google-cloud/storage", {
  namedExports: {
    Storage: class {
      bucket(name) {
        assert.equal(name, "test-videos")
        return {
          file: storageFile,
          async getFiles(options) {
            if (failList) throw new Error("Storage unavailable")
            listingOptions = options
            const names = new Set([
              ...objects.keys(),
              ...listed.map((file) => file.name),
            ])
            return [
              [...names]
                .filter((name) => name.startsWith(options.prefix))
                .map(storageFile),
            ]
          },
        }
      }
    },
  },
})

process.env.GCP_BUCKET_NAME = "test-videos"
delete process.env.VIDEO_PUBLIC_BASE_URL
const { POST } = await import("../src/app/api/upload/route.ts")
const { GET } = await import("../src/app/api/list/route.ts")
const { GET: getJobs } = await import("../src/app/api/jobs/route.ts")
const { POST: retryJob } =
  await import("../src/app/api/jobs/[id]/retry/route.ts")
const { processPendingVideos } = await import("../src/lib/jobs.ts")
const { getVideo, videoUrl } = await import("../src/lib/storage.ts")
const { validateVideos, MAX_BATCH_BYTES, VIDEO_TYPES, videoPagePath } =
  await import("../src/lib/videos.ts")

beforeEach(() => {
  writes = []
  objects.clear()
  listed = []
  failWrite = 0
  failList = false
  lookedUp = []
  failLookup = false
  delete process.env.VIDEO_PUBLIC_BASE_URL
})

function request(files, signal) {
  const body = new FormData()
  for (const file of files) body.append("video", file)
  return new Request("http://localhost/api/upload", {
    method: "POST",
    body,
    signal,
  })
}

test("accepts durable uploads before processing and converts every format after the client disconnects", async () => {
  const files = await Promise.all(
    Object.keys(VIDEO_TYPES).map(
      async (ext) =>
        new File([await createVideo(ext)], `holiday${ext.toUpperCase()}`, {
          type: "application/octet-stream",
        })
    )
  )
  const client = new AbortController()
  const response = await POST(request(files, client.signal))
  assert.equal(response.status, 202)
  const result = await response.json()
  assert.equal(result.success, true)
  assert.equal(result.jobs.length, files.length)
  assert.equal(new Set(result.jobs.map((job) => job.id)).size, files.length)
  assert.equal(writes.length, files.length)
  for (const [index, job] of result.jobs.entries()) {
    assert.equal(job.status, "queued")
    assert.deepEqual(
      objects.get(`videos/pending/${job.id}`).bytes,
      Buffer.from(await files[index].arrayBuffer())
    )
  }
  assert.deepEqual((await (await GET()).json()).videos, [])
  assert.equal((await getJobs()).headers.get("cache-control"), "no-store")
  assert.equal((await (await getJobs()).json()).jobs.length, files.length)
  client.abort()
  await processPendingVideos()
  assert.deepEqual((await (await getJobs()).json()).jobs, [])
  const converted = writes.slice(files.length)
  assert.equal(converted.length, files.length)
  for (const [index, write] of converted.entries()) {
    const file = { path: write.path, url: videoUrl(write.path) }
    assert.match(
      file.path,
      new RegExp(`^videos/${new Date().getUTCFullYear()}/[0-9A-Z]+\\.webm$`)
    )
    assert.equal(
      file.url,
      `https://storage.googleapis.com/test-videos/${file.path}`
    )
    assert.equal(write.options.metadata.contentType, "video/webm")
    const bytes = Buffer.concat(write.chunks)
    assert.notDeepEqual(bytes, Buffer.from(await files[index].arrayBuffer()))
    const { streams, format } = probeVideo(bytes)
    assert.match(format.format_name, /webm/)
    assert.deepEqual(
      streams.map((stream) => stream.codec_name),
      ["av1", "opus"]
    )
    assert.equal(streams[0].pix_fmt, "yuv420p")
    assert.equal(streams[1].channels, 2)
    const [, year, filename] = file.path.split("/")
    assert.deepEqual(await getVideo(year, filename), file)
  }
  assert.deepEqual(
    new Set((await (await GET()).json()).videos),
    new Set(converted.map((file) => videoUrl(file.path)))
  )
})

test("conversion failures retain the source and do not stop other jobs", async () => {
  const response = await POST(
    request([
      new File([await createVideo(".mp4")], "good.mp4"),
      new File(["invalid"], "broken.mp4"),
    ])
  )
  assert.equal(response.status, 202)
  const result = await response.json()
  await processPendingVideos()
  const { jobs } = await (await getJobs()).json()
  assert.deepEqual(jobs, [{ ...result.jobs[1], status: "failed" }])
  assert.ok(objects.has(`videos/pending/${result.jobs[1].id}`))
  assert.equal((await (await GET()).json()).videos.length, 1)
})

test("failed processing can be retried without uploading again or duplicating the output", async () => {
  const response = await POST(
    request([new File([await createVideo()], "video.mkv")])
  )
  const {
    jobs: [job],
  } = await response.json()
  failWrite = 2
  await processPendingVideos()
  assert.equal((await (await getJobs()).json()).jobs[0].status, "failed")
  const outputPath = writes[1].path
  failWrite = 0
  const retried = await retryJob(new Request("http://localhost"), {
    params: Promise.resolve({ id: job.id }),
  })
  assert.equal(retried.status, 202)
  await processPendingVideos()
  assert.equal(writes[2].path, outputPath)
  assert.deepEqual((await (await getJobs()).json()).jobs, [])
  assert.deepEqual([...objects.keys()], [outputPath])
  assert.equal(
    (
      await retryJob(new Request("http://localhost"), {
        params: Promise.resolve({ id: "../video.mkv" }),
      })
    ).status,
    409
  )
})

test("recovers expired processing leases while leaving active workers alone", async () => {
  const input = await createVideo()
  const { jobs } = await (
    await POST(
      request([new File([input], "a.mkv"), new File([input], "b.mkv")])
    )
  ).json()
  for (const [index, job] of jobs.entries()) {
    const object = objects.get(`videos/pending/${job.id}`)
    object.metadata.metadata.status = "processing"
    object.metadata.metadata.leaseUntil = String(
      Date.now() + (index ? 60000 : -60000)
    )
  }
  await processPendingVideos()
  assert.equal(objects.has(`videos/pending/${jobs[0].id}`), false)
  assert.equal(objects.has(`videos/pending/${jobs[1].id}`), true)
  assert.equal(writes.length, 3)
})

test("concurrent workers claim a queued source only once", async () => {
  await POST(request([new File([await createVideo()], "video.mkv")]))
  await Promise.all([processPendingVideos(), processPendingVideos()])
  assert.equal(writes.length, 2)
  assert.deepEqual((await (await getJobs()).json()).jobs, [])
})

test("rejects empty, non-file, unsupported, and mixed batches before any writes", async () => {
  for (const files of [
    [],
    ["text"],
    [new File([], "empty.mp4")],
    [new File(["image"], "photo.jpg")],
    [new File(["video"], "good.mp4"), new File(["bad"], "bad.txt")],
  ]) {
    assert.equal((await POST(request(files))).status, 400)
  }
  assert.equal(writes.length, 0)
})

test("rejects malformed multipart and oversized declared requests", async () => {
  assert.equal(
    (
      await POST(
        new Request("http://localhost/api/upload", {
          method: "POST",
          body: "not multipart",
        })
      )
    ).status,
    400
  )
  assert.equal(
    (
      await POST(
        new Request("http://localhost/api/upload", {
          method: "POST",
          headers: {
            "content-length": String(MAX_BATCH_BYTES + 2 * 1024 * 1024),
          },
        })
      )
    ).status,
    413
  )
  assert.equal(writes.length, 0)
})

test("enforces batch count and size without allocating large test files", () => {
  assert.equal(
    validateVideos([{ name: "recording.mkv", size: 828487418 }]),
    null
  )
  assert.match(
    validateVideos(Array.from({ length: 11 }, () => new File(["v"], "v.mp4"))),
    /at most 10/
  )
  assert.match(
    validateVideos([{ name: "large.mp4", size: MAX_BATCH_BYTES + 1 }]),
    /exceeds 2 GiB/
  )
  assert.match(
    validateVideos([
      { name: "a.mp4", size: MAX_BATCH_BYTES },
      { name: "b.webm", size: 1 },
    ]),
    /at most 2 GiB/
  )
})

test("reports partial uploads when a later storage write fails", async () => {
  failWrite = 2
  const input = await createVideo(".mp4")
  const response = await POST(
    request([new File([input], "a.mp4"), new File([input], "b.mp4")])
  )
  assert.equal(response.status, 500)
  const result = await response.json()
  assert.equal(result.jobs.length, 1)
  assert.match(result.message, /1 video\(s\) were queued/)
})

test("lists only current-year videos newest first, with no response caching", async () => {
  const prefix = `videos/${new Date().getUTCFullYear()}/`
  listed = ["001.mp4", "003.MOV", "002.webm", "readme.txt", ""].map((name) => ({
    name: `${prefix}${name}`,
  }))
  const response = await GET()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.deepEqual(listingOptions, { prefix, autoPaginate: true })
  assert.deepEqual(
    (await response.json()).videos,
    ["003.MOV", "002.webm", "001.mp4"].map(
      (name) => `https://storage.googleapis.com/test-videos/${prefix}${name}`
    )
  )
})

test("returns an empty gallery and handles storage listing errors", async () => {
  assert.deepEqual(await (await GET()).json(), { videos: [] })
  failList = true
  const response = await GET()
  assert.equal(response.status, 500)
  assert.match((await response.json()).message, /Unable to load videos/)
})

test("uses a configurable media origin and encodes object paths", () => {
  process.env.VIDEO_PUBLIC_BASE_URL = "https://cdn.example.com/media/"
  assert.equal(
    videoUrl("videos/2026/a b.mp4"),
    "https://cdn.example.com/media/videos/2026/a%20b.mp4"
  )
})

test("watch links preserve encoded filenames across storage and CDN prefixes", () => {
  for (const base of [
    "https://storage.googleapis.com/test-videos",
    "https://cdn.example.com/media",
  ]) {
    process.env.VIDEO_PUBLIC_BASE_URL = base
    assert.equal(
      videoPagePath(videoUrl("videos/2025/a b#c.MOV")),
      "/videos/2025/a%20b%23c.MOV"
    )
  }
})

test("looks up individual videos from past years and distinguishes missing files from storage errors", async () => {
  const path = "videos/2025/a b.MOV"
  listed = [{ name: path }]
  assert.deepEqual(await getVideo("2025", "a b.MOV"), {
    path,
    url: "https://storage.googleapis.com/test-videos/videos/2025/a%20b.MOV",
  })
  assert.deepEqual(lookedUp, [path])
  assert.equal(await getVideo("2025", "missing.mp4"), null)
  failLookup = true
  await assert.rejects(getVideo("2025", "a b.MOV"), /Storage unavailable/)
})

test("invalid watch paths never access storage", async () => {
  for (const [year, filename] of [
    ["invalid", "video.mp4"],
    ["2025", ""],
    ["2025", "readme.txt"],
    ["2025", "../video.mp4"],
    ["2025", "nested/video.mp4"],
    ["2025", "nested\\video.mp4"],
    ["2025", "video\0.mp4"],
  ]) {
    assert.equal(await getVideo(year, filename), null)
  }
  assert.deepEqual(lookedUp, [])
})
