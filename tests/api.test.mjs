import assert from "node:assert/strict"
import { Writable } from "node:stream"
import { beforeEach, mock, test } from "node:test"

import { createVideo, probeVideo } from "./media.mjs"

let writes = []
let listed = []
let listingOptions
let failWrite = 0
let failList = false
let lookedUp = []
let failLookup = false

mock.module("@google-cloud/storage", {
  namedExports: {
    Storage: class {
      bucket(name) {
        assert.equal(name, "test-videos")
        return {
          file(path) {
            return {
              async exists() {
                lookedUp.push(path)
                if (failLookup) throw new Error("Storage unavailable")
                return [listed.some((file) => file.name === path)]
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
                })
              },
            }
          },
          async getFiles(options) {
            if (failList) throw new Error("Storage unavailable")
            listingOptions = options
            return [listed]
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
const { getVideo, videoUrl } = await import("../src/lib/storage.ts")
const { validateVideos, MAX_BATCH_BYTES, VIDEO_TYPES, videoPagePath } =
  await import("../src/lib/videos.ts")

beforeEach(() => {
  writes = []
  listed = []
  failWrite = 0
  failList = false
  lookedUp = []
  failLookup = false
  delete process.env.VIDEO_PUBLIC_BASE_URL
})

function request(files) {
  const body = new FormData()
  for (const file of files) body.append("video", file)
  return new Request("http://localhost/api/upload", { method: "POST", body })
}

test("processes a mixed batch of every accepted format into AV1/Opus WebM with unique watch URLs", async () => {
  const files = await Promise.all(
    Object.keys(VIDEO_TYPES).map(
      async (ext) =>
        new File([await createVideo(ext)], `holiday${ext.toUpperCase()}`, {
          type: "application/octet-stream",
        })
    )
  )
  const response = await POST(request(files))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.success, true)
  assert.equal(result.files.length, files.length)
  assert.equal(
    new Set(result.files.map((file) => file.path)).size,
    files.length
  )
  listed = result.files.map((file) => ({ name: file.path }))
  for (const [index, file] of result.files.entries()) {
    assert.match(
      file.path,
      new RegExp(`^videos/${new Date().getUTCFullYear()}/[0-9A-Z]+\\.webm$`)
    )
    assert.equal(
      file.url,
      `https://storage.googleapis.com/test-videos/${file.path}`
    )
    assert.equal(writes[index].options.metadata.contentType, "video/webm")
    const bytes = Buffer.concat(writes[index].chunks)
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
    new Set(result.files.map((file) => file.url))
  )
})

test("conversion failures report already saved files without storing a broken video", async () => {
  const response = await POST(
    request([
      new File([await createVideo(".mp4")], "good.mp4"),
      new File(["invalid"], "broken.mp4"),
    ])
  )
  assert.equal(response.status, 500)
  const result = await response.json()
  assert.equal(result.files.length, 1)
  assert.match(result.message, /1 video\(s\) were saved/)
  assert.equal(writes.length, 1)
  assert.match(writes[0].path, /\.webm$/)
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
  assert.match(
    validateVideos(Array.from({ length: 11 }, () => new File(["v"], "v.mp4"))),
    /at most 10/
  )
  assert.match(
    validateVideos([{ name: "large.mp4", size: MAX_BATCH_BYTES + 1 }]),
    /exceeds 100 MiB/
  )
  assert.match(
    validateVideos([
      { name: "a.mp4", size: MAX_BATCH_BYTES },
      { name: "b.webm", size: 1 },
    ]),
    /at most 100 MiB/
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
  assert.equal(result.files.length, 1)
  assert.match(result.message, /1 video\(s\) were saved/)
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
