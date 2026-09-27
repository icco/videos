import { createWriteStream } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream } from "node:stream/web"

import busboy from "busboy"

import {
  MAX_BATCH_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_FILES,
  validateVideos,
  VIDEO_SIZE_LIMIT,
  VIDEO_TYPES,
  videoExtension,
} from "./videos.ts"

const MAX_REQUEST_BYTES = MAX_BATCH_BYTES + 1024 * 1024

export interface UploadedFile {
  name: string
  size: number
  path: string
}

export class UploadError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

// Validate the complete batch before conversion, keeping file contents on disk.
export async function withUploadedVideos<T>(
  req: Request,
  consume: (files: UploadedFile[]) => Promise<T>
): Promise<T> {
  const tooLarge = () =>
    new UploadError(`Upload at most ${VIDEO_SIZE_LIMIT} in one batch.`, 413)
  if (Number(req.headers.get("content-length")) > MAX_REQUEST_BYTES)
    throw tooLarge()
  if (!req.body) throw new UploadError("Send videos as multipart form data.")

  let parser: ReturnType<typeof busboy>
  try {
    parser = busboy({
      headers: Object.fromEntries(req.headers),
      limits: {
        files: MAX_VIDEO_FILES,
        fileSize: MAX_VIDEO_BYTES + 1,
        fields: 0,
        parts: MAX_VIDEO_FILES + 1,
      },
    })
  } catch {
    throw new UploadError("Send videos as multipart form data.")
  }

  const directory = await mkdtemp(join(tmpdir(), "videos-upload-"))
  const files: UploadedFile[] = []
  let videoBytes = 0
  const writes: Promise<void>[] = []
  let failure: Error | undefined
  let writeFailure: Error | undefined
  const fail = (error: Error) => {
    failure ||= error
    // Busboy must finish its current event before being destroyed.
    queueMicrotask(() => parser.destroy(failure))
  }
  const reject = (error: UploadError) => {
    failure ||= error
  }
  parser.on("filesLimit", () =>
    reject(new UploadError("Upload at most 10 videos at a time."))
  )
  parser.on("partsLimit", () =>
    reject(new UploadError("Upload at most 10 videos at a time."))
  )
  parser.on("fieldsLimit", () =>
    reject(new UploadError("Each video must be a file."))
  )
  parser.on("file", (field, stream, { filename }) => {
    stream.on("error", () => {}) // The parser and write pipeline report failures.
    if (field !== "video" || !VIDEO_TYPES[videoExtension(filename)]) {
      stream.resume()
      reject(new UploadError("Each video must be a supported video file."))
      return
    }
    const file = {
      name: filename,
      path: join(directory, String(files.length)),
      size: 0,
    }
    files.push(file)
    stream.on("data", (chunk: Buffer) => {
      file.size += chunk.length
      videoBytes += chunk.length
      if (videoBytes > MAX_BATCH_BYTES) reject(tooLarge())
    })
    stream.on("limit", () =>
      reject(new UploadError(`${filename} exceeds ${VIDEO_SIZE_LIMIT}.`, 413))
    )
    writes.push(
      pipeline(stream, createWriteStream(file.path), {
        signal: req.signal,
      }).catch((error: Error) => {
        writeFailure ||= error
        if (!parser.destroyed) fail(error)
      })
    )
  })

  let received = 0
  const counter = new Transform({
    transform(chunk: Buffer, encoding, callback) {
      received += chunk.length
      callback(received > MAX_REQUEST_BYTES ? tooLarge() : null, chunk)
    },
  })
  try {
    try {
      await pipeline(
        Readable.fromWeb(req.body as ReadableStream<Uint8Array>),
        counter,
        parser,
        { signal: req.signal }
      )
      await Promise.all(writes)
    } catch (error) {
      if (error instanceof UploadError || req.signal.aborted) throw error
      if (failure) throw failure
      throw new UploadError("Send videos as multipart form data.")
    }
    if (failure) throw failure
    if (writeFailure) throw writeFailure
    const message = validateVideos(files)
    if (message) throw new UploadError(message)
    return await consume(files)
  } finally {
    await Promise.all(writes)
    await rm(directory, { recursive: true, force: true })
  }
}
