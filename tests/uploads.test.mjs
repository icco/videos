import assert from "node:assert/strict"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, mock, test } from "node:test"

const videos = await import("../src/lib/videos.ts")
// Exercise real streaming limit boundaries without gigabyte-sized fixtures.
mock.module("../src/lib/videos.ts", {
  namedExports: {
    ...videos,
    MAX_VIDEO_BYTES: 128,
    MAX_BATCH_BYTES: 192,
    MAX_VIDEO_FILES: 2,
  },
})
const { UploadError, withUploadedVideos } =
  await import("../src/lib/uploads.ts")

const previousTmpdir = process.env.TMPDIR
let directory
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "videos-upload-test-"))
  process.env.TMPDIR = directory
})
after(async () => {
  if (previousTmpdir === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = previousTmpdir
  await rm(directory, { recursive: true, force: true })
})

async function request(
  files,
  { truncate = false, abort = false, chunkSize = 7 } = {}
) {
  const form = new FormData()
  for (const file of files) form.append("video", file)
  const encoded = new Request("http://localhost/api/upload", {
    method: "POST",
    body: form,
  })
  const bytes = new Uint8Array(await encoded.arrayBuffer())
  const abortAt = Buffer.from(bytes).indexOf("\r\n\r\n") + 20
  const length = truncate ? bytes.length - 20 : bytes.length
  const aborter = new AbortController()
  let offset = 0
  return new Request(encoded.url, {
    method: "POST",
    headers: encoded.headers,
    duplex: "half",
    signal: aborter.signal,
    body: new ReadableStream({
      pull(controller) {
        if (abort && offset > abortAt) {
          aborter.abort()
          controller.close()
        } else if (offset >= length) {
          controller.close()
        } else {
          controller.enqueue(
            bytes.slice(offset, Math.min(offset + chunkSize, length))
          )
          offset += chunkSize
        }
      },
    }),
  })
}

test("streams split multipart boundaries to disk with exact bytes at file and batch limits", async () => {
  const inputs = [
    new File([Buffer.alloc(128, 1)], "a.MKV"),
    new File([Buffer.alloc(64, 2)], "b.webm"),
  ]
  const req = await request(inputs)
  assert.equal(req.headers.get("content-length"), null)
  await withUploadedVideos(req, async (files) => {
    assert.deepEqual(
      files.map(({ name, size }) => ({ name, size })),
      inputs.map(({ name, size }) => ({ name, size }))
    )
    for (const [index, file] of files.entries()) {
      assert.deepEqual(
        await readFile(file.path),
        Buffer.from(await inputs[index].arrayBuffer())
      )
    }
  })
  assert.deepEqual(await readdir(directory), [])
})

test("rejects oversized files and batches received without content-length", async () => {
  for (const files of [
    [new File([Buffer.alloc(129)], "large.mkv")],
    [
      new File([Buffer.alloc(100)], "a.mp4"),
      new File([Buffer.alloc(100)], "b.mp4"),
    ],
  ]) {
    let consumed = false
    await assert.rejects(
      withUploadedVideos(await request(files), async () => {
        consumed = true
      }),
      (error) => error instanceof UploadError && error.status === 413
    )
    assert.equal(consumed, false)
    assert.deepEqual(await readdir(directory), [])
  }
})

test("caps the raw request even when excess data is in non-file fields", async () => {
  let consumed = false
  await assert.rejects(
    withUploadedVideos(
      await request(["x".repeat(1024 * 1024 + 193)], { chunkSize: 16384 }),
      async () => {
        consumed = true
      }
    ),
    (error) => error instanceof UploadError && error.status === 413
  )
  assert.equal(consumed, false)
  assert.deepEqual(await readdir(directory), [])
})

test("rejects excess files and truncated multipart data before consuming a batch", async () => {
  for (const req of [
    await request(
      Array.from({ length: 3 }, () => new File(["v"], "video.mp4"))
    ),
    await request([new File(["v"], "video.mp4")], { truncate: true }),
  ]) {
    let consumed = false
    await assert.rejects(
      withUploadedVideos(req, async () => {
        consumed = true
      }),
      (error) => error instanceof UploadError && error.status === 400
    )
    assert.equal(consumed, false)
    assert.deepEqual(await readdir(directory), [])
  }
})

test("removes partial files on cancellation and staged files when processing fails", async () => {
  await assert.rejects(
    withUploadedVideos(
      await request([new File([Buffer.alloc(64)], "video.mp4")], {
        abort: true,
      }),
      async () => assert.fail("Cancelled upload must not be processed")
    )
  )
  assert.deepEqual(await readdir(directory), [])
  await assert.rejects(
    withUploadedVideos(
      await request([new File(["v"], "video.mp4")]),
      async () => {
        throw new Error("Conversion failed")
      }
    ),
    /Conversion failed/
  )
  assert.deepEqual(await readdir(directory), [])
})
