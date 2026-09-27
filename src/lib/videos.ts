export const VIDEO_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
  ".mkv": "video/matroska",
}

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
export const MAX_BATCH_BYTES = MAX_VIDEO_BYTES
export const VIDEO_SIZE_LIMIT = "2 GiB"
export const MAX_VIDEO_FILES = 10
export const VIDEO_ACCEPT = Object.keys(VIDEO_TYPES).join(",")

export function videoExtension(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase()
}

export function videoPath(year: string, filename: string): string | null {
  if (
    !/^\d{4}$/.test(year) ||
    !filename ||
    /[/\\]/.test(filename) ||
    filename.includes("\0") ||
    !VIDEO_TYPES[videoExtension(filename)]
  ) {
    return null
  }
  return `videos/${year}/${filename}`
}

export function videoPagePath(url: string): string {
  return `/videos/${new URL(url).pathname.split("/").slice(-2).join("/")}`
}

export function validateVideos(
  files: Pick<File, "name" | "size">[]
): string | null {
  if (!files.length) return "Select at least one video."
  if (files.length > MAX_VIDEO_FILES)
    return "Upload at most 10 videos at a time."
  for (const file of files) {
    if (!VIDEO_TYPES[videoExtension(file.name)]) {
      return `${file.name}: use MP4, M4V, WebM, MOV, OGV, or MKV.`
    }
    if (!file.size) return `${file.name} is empty.`
    if (file.size > MAX_VIDEO_BYTES)
      return `${file.name} exceeds ${VIDEO_SIZE_LIMIT}.`
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) {
    return `Upload at most ${VIDEO_SIZE_LIMIT} in one batch.`
  }
  return null
}

export interface VideoJob {
  id: string
  name: string
  status: "queued" | "processing" | "failed"
}
