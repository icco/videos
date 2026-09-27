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
    async (stream, ext) => {
      assert.equal(ext, ".webm")
      const bytes = Buffer.concat(await Array.fromAsync(stream))
      const { streams, format } = probeVideo(bytes)
      assert.match(format.format_name, /webm/)
      assert.equal(streams.length, 1)
      assert.equal(streams[0].codec_name, "av1")
      assert.equal(streams[0].pix_fmt, "yuv420p")
      assert.equal(streams[0].width, 64)
      assert.equal(streams[0].height, 64)
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
