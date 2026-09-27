import { execFile, execFileSync } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const FORMATS = {
  ".mp4": ["mp4", "mpeg4", "aac"],
  ".m4v": ["ipod", "mpeg4", "aac"],
  ".mov": ["mov", "mpeg4", "aac"],
  ".webm": ["webm", "libvpx-vp9", "libopus"],
  ".ogv": ["ogg", "libvpx", "libopus"],
  ".mkv": ["matroska", "ffv1", "pcm_s16le"],
}

export async function createVideo(
  extension = ".mkv",
  { audio = true, width = 32, height = 24 } = {}
) {
  const [format, videoCodec, audioCodec] = FORMATS[extension]
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=${width}x${height}:rate=10`,
      ...(audio ? ["-f", "lavfi", "-i", "sine=frequency=440"] : []),
      "-t",
      "0.2",
      "-c:v",
      videoCodec,
      "-pix_fmt",
      extension === ".mkv" ? "yuv444p" : "yuv420p",
      "-c:a",
      audioCodec,
      ...(["mp4", "ipod", "mov"].includes(format)
        ? ["-movflags", "frag_keyframe+empty_moov"]
        : []),
      "-f",
      format,
      "pipe:1",
    ],
    { encoding: "buffer" }
  )
  return stdout
}

export function probeVideo(bytes) {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", "pipe:0"],
      { input: bytes, encoding: "utf8" }
    )
  )
}
