import { execFile } from "node:child_process"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream } from "node:stream/web"
import { promisify } from "node:util"

import { videoExtension } from "./videos.ts"

const execFileAsync = promisify(execFile)

// Keep the temporary MP4 alive until its upload finishes, including on errors.
export async function withPreparedVideo<T>(
  file: File,
  upload: (stream: Readable, extension: string) => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  let extension = videoExtension(file.name)
  let directory: string | undefined
  let stream: Readable | undefined
  try {
    if (extension === ".mkv") {
      directory = await mkdtemp(join(tmpdir(), "videos-"))
      const input = join(directory, "input.mkv")
      const output = join(directory, "output.mp4")
      await pipeline(
        Readable.fromWeb(file.stream() as ReadableStream<Uint8Array>),
        createWriteStream(input),
        { signal }
      )
      await execFileAsync(
        "ffmpeg",
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-f",
          "matroska",
          "-i",
          input,
          "-map",
          "0:V:0",
          "-map",
          "0:a:0?",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "23",
          "-vf",
          "pad=ceil(iw/2)*2:ceil(ih/2)*2",
          "-pix_fmt",
          "yuv420p",
          "-threads",
          "2",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          output,
        ],
        { signal, timeout: 5 * 60 * 1000, killSignal: "SIGKILL" }
      )
      stream = createReadStream(output)
      extension = ".mp4"
    } else {
      stream = Readable.fromWeb(file.stream() as ReadableStream<Uint8Array>)
    }
    return await upload(stream, extension)
  } finally {
    stream?.destroy()
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}
