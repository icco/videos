import { execFile, execFileSync } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export async function createMkv({
  audio = true,
  width = 32,
  height = 24,
} = {}) {
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
      "ffv1",
      "-pix_fmt",
      "yuv444p",
      "-c:a",
      "pcm_s16le",
      "-f",
      "matroska",
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
