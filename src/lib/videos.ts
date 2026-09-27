export const VIDEO_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
}

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
export const MAX_BATCH_BYTES = 100 * 1024 * 1024
export const MAX_VIDEO_FILES = 10
export const VIDEO_ACCEPT = Object.keys(VIDEO_TYPES).join(",")

export function videoExtension(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase()
}

export function validateVideos(files: File[]): string | null {
  if (!files.length) return "Select at least one video."
  if (files.length > MAX_VIDEO_FILES)
    return "Upload at most 10 videos at a time."
  for (const file of files) {
    if (!VIDEO_TYPES[videoExtension(file.name)]) {
      return `${file.name}: use MP4, M4V, WebM, MOV, or OGV.`
    }
    if (!file.size) return `${file.name} is empty.`
    if (file.size > MAX_VIDEO_BYTES) return `${file.name} exceeds 100 MiB.`
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) {
    return "Upload at most 100 MiB in one batch."
  }
  return null
}

export interface UploadedVideo {
  path: string
  url: string
}
