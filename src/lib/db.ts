import postgres from "postgres"

export interface VideoRecord {
  path: string
  originalName: string
  summary: string | null
  tags: string[]
  durationSeconds: number
  width: number
  height: number
  videoCodec: string
  audioCodec: string | null
  sizeBytes: number
  createdAt: string
}

interface VideoRow {
  path: string
  original_name: string
  summary: string | null
  tags: string[] | null
  duration_seconds: number | string
  width: number
  height: number
  video_codec: string
  audio_codec: string | null
  size_bytes: number | string
  created_at: Date | string
}

const DB_TIMEOUT_MS = 5000

let cachedUrl: string | undefined
let client: postgres.Sql | undefined
let initialized: Promise<void> | undefined

function getSql(): postgres.Sql | null {
  const url = process.env.DATABASE_URL
  if (!url) return null
  if (!client || cachedUrl !== url) {
    cachedUrl = url
    client = postgres(url, {
      max: 5,
      connect_timeout: 5,
      idle_timeout: 20,
      connection: {
        statement_timeout: DB_TIMEOUT_MS,
        lock_timeout: DB_TIMEOUT_MS,
      },
    })
    initialized = undefined
  }
  return client
}

async function withQueryDeadline<T>(
  query: Promise<T> & { cancel?: () => void },
  signal?: AbortSignal
): Promise<T> {
  const deadline = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(DB_TIMEOUT_MS)])
    : AbortSignal.timeout(DB_TIMEOUT_MS)
  deadline.throwIfAborted()
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      try {
        query.cancel?.()
      } catch {
        // Ignore cancellation errors on a dead connection.
      }
      reject(deadline.reason ?? new Error("Database query timed out"))
    }
    deadline.addEventListener("abort", onAbort, { once: true })
    query.then(
      (value) => {
        deadline.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (error) => {
        deadline.removeEventListener("abort", onAbort)
        reject(error)
      }
    )
  })
}

async function ensureSchema(
  sql: postgres.Sql,
  signal?: AbortSignal
): Promise<void> {
  if (!initialized) {
    initialized = withQueryDeadline(
      sql`
        CREATE TABLE IF NOT EXISTS video_metadata (
          path TEXT PRIMARY KEY,
          original_name TEXT NOT NULL,
          summary TEXT,
          tags TEXT[] NOT NULL DEFAULT '{}',
          duration_seconds DOUBLE PRECISION NOT NULL,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          video_codec TEXT NOT NULL,
          audio_codec TEXT,
          size_bytes BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      signal
    )
      .then(() => undefined)
      .catch((error) => {
        initialized = undefined
        throw error
      })
  }
  await initialized
}

function toRecord(row: VideoRow): VideoRecord {
  return {
    path: row.path,
    originalName: row.original_name,
    summary: row.summary,
    tags: Array.isArray(row.tags) ? row.tags : [],
    durationSeconds: Number(row.duration_seconds),
    width: Number(row.width),
    height: Number(row.height),
    videoCodec: row.video_codec,
    audioCodec: row.audio_codec,
    sizeBytes: Number(row.size_bytes),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }
}

export async function saveVideoMetadata(
  record: Omit<VideoRecord, "createdAt">,
  signal?: AbortSignal
): Promise<VideoRecord | null> {
  const sql = getSql()
  if (!sql) return null
  await ensureSchema(sql, signal)
  const [row] = await withQueryDeadline(
    sql<VideoRow[]>`
      INSERT INTO video_metadata (
        path,
        original_name,
        summary,
        tags,
        duration_seconds,
        width,
        height,
        video_codec,
        audio_codec,
        size_bytes
      ) VALUES (
        ${record.path},
        ${record.originalName},
        ${record.summary},
        ${record.tags},
        ${record.durationSeconds},
        ${record.width},
        ${record.height},
        ${record.videoCodec},
        ${record.audioCodec},
        ${record.sizeBytes}
      )
      ON CONFLICT (path) DO UPDATE SET
        original_name = EXCLUDED.original_name,
        summary = EXCLUDED.summary,
        tags = EXCLUDED.tags,
        duration_seconds = EXCLUDED.duration_seconds,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        video_codec = EXCLUDED.video_codec,
        audio_codec = EXCLUDED.audio_codec,
        size_bytes = EXCLUDED.size_bytes
      RETURNING *
    `,
    signal
  )
  return row ? toRecord(row) : null
}

export async function getVideoMetadata(
  path: string,
  signal?: AbortSignal
): Promise<VideoRecord | null> {
  const sql = getSql()
  if (!sql) return null
  try {
    await ensureSchema(sql, signal)
    const [row] = await withQueryDeadline(
      sql<VideoRow[]>`
        SELECT
          path,
          original_name,
          summary,
          tags,
          duration_seconds,
          width,
          height,
          video_codec,
          audio_codec,
          size_bytes,
          created_at
        FROM video_metadata
        WHERE path = ${path}
      `,
      signal
    )
    return row ? toRecord(row) : null
  } catch (error) {
    console.error("Video metadata lookup failed:", error)
    return null
  }
}
