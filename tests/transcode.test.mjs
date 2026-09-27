import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"

import { withPreparedVideo } from "../src/lib/transcode.ts"
import { createMkv, probeVideo } from "./media.mjs"

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

test("converts silent odd-sized MKV to fast-start H.264 MP4 and removes temporary files", async () => {
  const input = await createMkv({ audio: false, width: 33, height: 25 })
  await withPreparedVideo(
    new File([input], "silent.mkv"),
    async (stream, ext) => {
      assert.equal(ext, ".mp4")
      const bytes = Buffer.concat(await Array.fromAsync(stream))
      const { streams, format } = probeVideo(bytes)
      assert.match(format.format_name, /mp4/)
      assert.equal(streams.length, 1)
      assert.equal(streams[0].codec_name, "h264")
      assert.equal(streams[0].pix_fmt, "yuv420p")
      assert.equal(streams[0].width, 34)
      assert.equal(streams[0].height, 26)
      assert.ok(bytes.indexOf("moov") > 0)
      assert.ok(bytes.indexOf("moov") < bytes.indexOf("mdat"))
    }
  )
  assert.deepEqual(await readdir(directory), [])
})

test("removes converted files when the upload fails", async () => {
  const input = await createMkv()
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

test("rejects invalid MKV and cancelled processing without uploading or leaving temporary files", async () => {
  for (const signal of [undefined, AbortSignal.abort()]) {
    let uploaded = false
    await assert.rejects(
      withPreparedVideo(
        new File(["invalid video"], "broken.mkv"),
        async () => {
          uploaded = true
        },
        signal
      )
    )
    assert.equal(uploaded, false)
    assert.deepEqual(await readdir(directory), [])
  }
})
