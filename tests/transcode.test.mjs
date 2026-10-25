import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"

import { withPreparedVideo } from "../src/lib/transcode.ts"
import { VIDEO_TYPES } from "../src/lib/videos.ts"
import { createVideo, probeVideo } from "./media.mjs"

const previousTmpdir = process.env.TMPDIR
let directory

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "videos-test-"))
  process.env.TMPDIR = directory
})

after(async () => {
  if (previousTmpdir === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = previousTmpdir
  await rm(directory, { recursive: true, force: true })
})

test("converts silent odd-sized video to AV1 WebM and removes temporary files", async () => {
  const input = await createVideo(".mkv", {
    audio: false,
    width: 33,
    height: 25,
  })
  await withPreparedVideo(
    new File([input], "silent.mkv"),
    async (stream, ext, thumbnail, details) => {
      assert.equal(ext, ".webm")
      assert.ok(thumbnail, "provides a thumbnail stream")
      const [bytes, thumbnailBytes] = await Promise.all([
        Array.fromAsync(stream).then((chunks) => Buffer.concat(chunks)),
        Array.fromAsync(thumbnail).then((chunks) => Buffer.concat(chunks)),
      ])
      const { streams, format } = probeVideo(bytes)
      assert.match(format.format_name, /webm/)
      assert.equal(streams.length, 1)
      assert.equal(streams[0].codec_name, "av1")
      assert.equal(streams[0].pix_fmt, "yuv420p")
      assert.equal(streams[0].width, 64)
      assert.equal(streams[0].height, 64)

      const probedThumbnail = probeVideo(thumbnailBytes)
      assert.equal(probedThumbnail.streams.length, 1)
      assert.equal(probedThumbnail.streams[0].codec_name, "mjpeg")
      assert.equal(probedThumbnail.streams[0].width, 64)
      assert.equal(probedThumbnail.streams[0].height, 64)

      assert.ok(details, "provides probed video details")
      assert.equal(details.width, 64)
      assert.equal(details.height, 64)
      assert.equal(details.videoCodec, "av1")
      assert.equal(details.audioCodec, null)
      assert.equal(details.sizeBytes, bytes.length)
      assert.ok(details.durationSeconds > 0)
      assert.ok(details.frames.length >= 1)
    }
  )
  assert.deepEqual(await readdir(directory), [])
})

test("removes converted files when the upload fails", async () => {
  const input = await createVideo()
  await assert.rejects(
    withPreparedVideo(new File([input], "video.mkv"), async (stream) => {
      for await (const chunk of stream) {
        assert.ok(chunk.length)
        throw new Error("Storage unavailable")
      }
    }),
    /Storage unavailable/
  )
  assert.deepEqual(await readdir(directory), [])
})

test("rejects invalid video in every accepted format without uploading or leaving temporary files", async () => {
  for (const extension of Object.keys(VIDEO_TYPES)) {
    let uploaded = false
    await assert.rejects(
      withPreparedVideo(
        new File(["invalid video"], `broken${extension}`),
        async () => {
          uploaded = true
        }
      )
    )
    assert.equal(uploaded, false)
    assert.deepEqual(await readdir(directory), [])
  }
})

test("cleans up cancelled processing without uploading", async () => {
  let uploaded = false
  await assert.rejects(
    withPreparedVideo(
      new File([await createVideo(".mp4")], "video.mp4"),
      async () => {
        uploaded = true
      },
      AbortSignal.abort()
    )
  )
  assert.equal(uploaded, false)
  assert.deepEqual(await readdir(directory), [])
})
