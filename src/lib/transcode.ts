import { execFile } from "node:child_process"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream } from "node:stream/web"
import { promisify } from "node:util"

import type { UploadedFile } from "./uploads.ts"
import { videoExtension } from "./videos.ts"

const execFileAsync = promisify(execFile)

export interface PreparedVideoDetails {
  durationSeconds: number
  width: number
  height: number
  videoCodec: string
  audioCodec: string | null
  sizeBytes: number
  frames: Buffer[]
}

interface ProbedStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  duration?: string
}

interface ProbedFormat {
  duration?: string
}

const INPUT_FORMATS: Record<string, string> = {
  ".mp4": "mov",
  ".m4v": "mov",
  ".webm": "matroska",
  ".mov": "mov",
  ".ogv": "ogg",
  ".mkv": "matroska",
}

const SAMPLE_POSITIONS = [0.1, 0.35, 0.65, 0.9]

// Keep the temporary WebM alive until its upload finishes, including on errors.
export async function withPreparedVideo<T>(
  file: File | UploadedFile,
  upload: (
    stream: Readable,
    extension: string,
    thumbnail: Readable,
    details: PreparedVideoDetails
  ) => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  const inputFormat = INPUT_FORMATS[videoExtension(file.name)]
  if (!inputFormat) throw new Error("Unsupported video format.")
  const directory = await mkdtemp(join(tmpdir(), "videos-"))
  let stream: Readable | undefined
  let thumbnail: Readable | undefined
  try {
    const input = "path" in file ? file.path : join(directory, "input")
    const output = join(directory, "output.webm")
    const poster = join(directory, "output.jpg")
    if (!("path" in file)) {
      await pipeline(
        Readable.fromWeb(file.stream() as ReadableStream<Uint8Array>),
        createWriteStream(input),
        { signal }
      )
    }
    const padFilter = "pad=ceil(max(iw\\,64)/2)*2:ceil(max(ih\\,64)/2)*2"
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
        padFilter,
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
        "-map",
        "0:V:0",
        "-vf",
        `${padFilter},scale='min(1280,iw)':-2,thumbnail`,
        "-frames:v",
        "1",
        "-update",
        "1",
        "-q:v",
        "3",
        poster,
      ],
      { signal, timeout: 60 * 60 * 1000, killSignal: "SIGKILL" }
    )
    const [{ stdout: probeJson }, fileStat] = await Promise.all([
      execFileAsync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
        { signal }
      ),
      stat(output),
    ])
    const probed = JSON.parse(probeJson) as {
      streams?: ProbedStream[]
      format?: ProbedFormat
    }
    const streams = probed.streams || []
    const videoStream = streams.find((s) => s.codec_type === "video")
    const audioStream = streams.find((s) => s.codec_type === "audio")
    const durationSeconds =
      Number(probed.format?.duration || videoStream?.duration || 0) || 0
    const timestamps =
      durationSeconds >= 1
        ? SAMPLE_POSITIONS.map((pos) => (durationSeconds * pos).toFixed(3))
        : ["0"]
    const frames = await Promise.all(
      timestamps.map(async (timestamp, index) => {
        const framePath = join(directory, `frame-${index}.jpg`)
        await execFileAsync(
          "ffmpeg",
          [
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            timestamp,
            "-i",
            output,
            "-map",
            "0:V:0",
            "-vf",
            "scale='min(640,iw)':-2",
            "-frames:v",
            "1",
            "-update",
            "1",
            "-q:v",
            "4",
            framePath,
          ],
          { signal, timeout: 60 * 1000, killSignal: "SIGKILL" }
        )
        return await readFile(framePath)
      })
    )
    stream = createReadStream(output)
    thumbnail = createReadStream(poster)
    return await upload(stream, ".webm", thumbnail, {
      durationSeconds,
      width: Number(videoStream?.width || 0),
      height: Number(videoStream?.height || 0),
      videoCodec: String(videoStream?.codec_name || "av1"),
      audioCodec: audioStream?.codec_name
        ? String(audioStream.codec_name)
        : null,
      sizeBytes: fileStat.size,
      frames,
    })
  } finally {
    stream?.destroy()
    thumbnail?.destroy()
    await rm(directory, { recursive: true, force: true })
  }
}
