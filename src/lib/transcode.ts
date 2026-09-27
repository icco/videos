import { execFile } from "node:child_process"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream } from "node:stream/web"
import { promisify } from "node:util"

import type { UploadedFile } from "./uploads.ts"
import { videoExtension } from "./videos.ts"

const execFileAsync = promisify(execFile)

const INPUT_FORMATS: Record<string, string> = {
  ".mp4": "mov",
  ".m4v": "mov",
  ".webm": "matroska",
  ".mov": "mov",
  ".ogv": "ogg",
  ".mkv": "matroska",
}

// Keep the temporary WebM alive until its upload finishes, including on errors.
export async function withPreparedVideo<T>(
  file: File | UploadedFile,
  upload: (stream: Readable, extension: string) => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  const inputFormat = INPUT_FORMATS[videoExtension(file.name)]
  if (!inputFormat) throw new Error("Unsupported video format.")
  const directory = await mkdtemp(join(tmpdir(), "videos-"))
  let stream: Readable | undefined
  try {
    const input = "path" in file ? file.path : join(directory, "input")
    const output = join(directory, "output.webm")
    if (!("path" in file)) {
      await pipeline(
        Readable.fromWeb(file.stream() as ReadableStream<Uint8Array>),
        createWriteStream(input),
        { signal }
      )
    }
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
        inputFormat,
        "-i",
        input,
        "-map",
        "0:V:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libsvtav1",
        "-preset",
        "8",
        "-crf",
        "30",
        "-vf",
        // SVT-AV1 in the Docker image requires even dimensions of at least 64×64.
        "pad=ceil(max(iw\\,64)/2)*2:ceil(max(ih\\,64)/2)*2",
        "-pix_fmt",
        "yuv420p",
        "-svtav1-params",
        "lp=2",
        "-c:a",
        "libopus",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-cues_to_front",
        "1",
        output,
      ],
      { signal, timeout: 60 * 60 * 1000, killSignal: "SIGKILL" }
    )
    stream = createReadStream(output)
    return await upload(stream, ".webm")
  } finally {
    stream?.destroy()
    await rm(directory, { recursive: true, force: true })
  }
}
