import assert from "node:assert/strict"
import { Writable } from "node:stream"
import { beforeEach, mock, test } from "node:test"

let writes = []
let listed = []
let listingOptions
let failWrite = 0
let failList = false

mock.module("@google-cloud/storage", {
  namedExports: {
    Storage: class {
      bucket(name) {
        assert.equal(name, "test-videos")
        return {
          file(path) {
            return {
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
const { videoUrl } = await import("../src/lib/storage.ts")
const { validateVideos, MAX_BATCH_BYTES } = await import("../src/lib/videos.ts")

beforeEach(() => {
  writes = []
  listed = []
  failWrite = 0
  failList = false
  delete process.env.VIDEO_PUBLIC_BASE_URL
})

function request(files) {
  const body = new FormData()
  for (const file of files) body.append("video", file)
  return new Request("http://localhost/api/upload", { method: "POST", body })
}

test("uploads multiple videos with unique paths, exact bytes, and playback MIME types", async () => {
  const response = await POST(
    request([
      new File(["first video"], "holiday.MP4", {
        type: "application/octet-stream",
      }),
      new File(["second video"], "holiday.webm", { type: "video/webm" }),
    ])
  )
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.success, true)
  assert.equal(result.files.length, 2)
  assert.notEqual(result.files[0].path, result.files[1].path)
  assert.match(
    result.files[0].path,
    new RegExp(`^videos/${new Date().getUTCFullYear()}/[0-9A-Z]+\\.mp4$`)
  )
  assert.equal(
    result.files[0].url,
    `https://storage.googleapis.com/test-videos/${result.files[0].path}`
  )
  assert.equal(writes[0].options.metadata.contentType, "video/mp4")
  assert.equal(writes[1].options.metadata.contentType, "video/webm")
  assert.equal(Buffer.concat(writes[0].chunks).toString(), "first video")
  assert.equal(Buffer.concat(writes[1].chunks).toString(), "second video")
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
  const response = await POST(
    request([new File(["a"], "a.mp4"), new File(["b"], "b.mp4")])
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
