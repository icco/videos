# Videos

A video uploader and index for `videos.natwelch.com`, following
[icco/photos](https://github.com/icco/photos) and built on
[icco/nextjs-template](https://github.com/icco/nextjs-template).

## Features

- Multi-file uploads to Google Cloud Storage under `videos/<UTC year>/<TSID>.<ext>`.
- Server-rendered current-year filename index, newest first, refreshed after uploads.
- Shareable watch pages at `/videos/<year>/<filename>`, including past years.
- Native video controls, inline mobile playback, and direct video links on watch pages.
- Watch-page streaming with a player-shaped loading skeleton.
- MP4, M4V, WebM, MOV, OGV, and MKV uploads; up to 10 files and 2 GiB per batch.
- Streaming multipart uploads to temporary files, keeping large recordings out of memory.
- Automatic conversion of every upload to WebM with AV1 video and Opus audio.
- Empty, retry, upload-in-progress, success, and failure states.
- Shared header/footer, light/dark themes, and Web Vitals, like the photos site.
- Strict TypeScript, CI, CodeQL, Dependabot, and a non-root standalone Docker image.

Every new upload, including MP4 and WebM, is converted with FFmpeg before being
saved as a `.webm` file.
Conversion uses the first video track and first audio track (if present), with
AV1/yuv420p video and stereo Opus audio. Subtitles and additional tracks are
omitted; only the converted WebM is stored. The seek index is moved to the front
of the file. Frames are padded to even dimensions and at least 64×64 pixels for
SVT-AV1 compatibility. Encoding uses SVT-AV1 preset 8, CRF 30, and 128 kbps audio.
WebM with AV1/Opus offers efficient compression using open codecs; see
[MDN's codec recommendations](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs#recommendations_for_the_web).
Playback requires AV1 support, which is limited on older Apple devices.
Previously stored files remain accessible in their existing formats.

## Development

Use Node 26 and pnpm 11.2.2.

Install FFmpeg (including `ffprobe` for tests) with `libsvtav1` and `libopus` encoders:
`brew install ffmpeg` on macOS or `sudo apt-get install ffmpeg` on Debian/Ubuntu.
The Docker runtime includes FFmpeg.

```sh
npm install --global pnpm@11.2.2
export NODE_AUTH_TOKEN="$(gh auth token)"
pnpm install --frozen-lockfile
cp .env.example .env.local
gcloud auth application-default login
pnpm dev
```

Open <http://localhost:8080>. `NODE_AUTH_TOKEN` needs GitHub Packages read access
for `@icco/react-common`. GCS uses Application Default Credentials (a workload
service account in production, local gcloud credentials, or
`GOOGLE_APPLICATION_CREDENTIALS` pointing to a key outside the repository).

| Variable                | Default                                   | Purpose                                  |
| ----------------------- | ----------------------------------------- | ---------------------------------------- |
| `GCP_PROJECT_ID`        | `icco-cloud`                              | Google Cloud project                     |
| `GCP_BUCKET_NAME`       | `icco-cloud`                              | Bucket for uploads and listing           |
| `VIDEO_PUBLIC_BASE_URL` | `https://storage.googleapis.com/<bucket>` | Public bucket/CDN URL, without `videos/` |

## API

- `POST /api/upload`: multipart form data with one or more `video` file fields.
  Returns `{ success: true, files: [{ path, url }] }`. Invalid requests return 400
  (or 413 for oversized uploads, including chunked requests). Conversion or storage failures return
  500 with a message and any files already uploaded, allowing partial uploads to be seen.
- `GET /api/list`: returns `{ videos: [url, ...] }` for the current UTC year,
  newest first, without response caching.
- `GET /healthz`: readiness endpoint, independent of GCS credentials.

Uploads are streamed to temporary files with file, count, batch, and total-request
limits enforced while receiving them. The complete batch is validated before
conversion or storage begins. Videos are processed one at a time, with a one-hour
conversion timeout per file, and the response arrives after processing finishes.
Temporary files are removed after success, failure, or cancellation. Long
recordings can take tens of minutes; keep the upload page open until completion.

## Checks

```sh
pnpm check
pnpm test
pnpm build
pnpm test:smoke
```

API tests use mocked storage and real FFmpeg conversion of generated fixtures, so
checks require FFmpeg and ffprobe but no GCP credentials or live writes.
`pnpm format` and `pnpm lint:fix` apply formatting and import-order fixes.

All application and configuration changes go through pull requests.
