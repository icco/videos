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
- MP4, M4V, WebM, MOV, OGV, and MKV uploads; up to 10 files and 100 MiB per batch.
- Automatic MKV-to-MP4 conversion with H.264 video, AAC audio, and fast-start playback.
- Empty, retry, upload-in-progress, success, and failure states.
- Shared header/footer, light/dark themes, and Web Vitals, like the photos site.
- Strict TypeScript, CI, CodeQL, Dependabot, and a non-root standalone Docker image.

New MKV uploads are converted with FFmpeg before being saved as `.mp4` files.
Conversion uses the first video track and first audio track (if present), with
H.264/yuv420p video and stereo AAC audio for broad browser support. Subtitles and
additional tracks are omitted; only the converted MP4 is stored. MP4 metadata is
moved to the start of the file so playback can begin before the full download.
Other formats are stored as uploaded, and existing MKV files remain accessible.
Their playback depends on the browser, container, and codec.

## Development

Use Node 26 and pnpm 11.2.2.

Install FFmpeg (including `ffprobe` for tests) with the `libx264` encoder available:
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

The runtime identity needs object create/list/get permissions. The bucket or CDN must
allow viewers to read uploaded objects; the app does not change bucket IAM.
Direct GCS URLs support range requests for playback and seeking. A custom CDN
must also support video content types and range requests. Set
`VIDEO_PUBLIC_BASE_URL` at **both build and runtime** when using a custom domain,
because the media CSP is generated at build time.

## API

- `POST /api/upload`: multipart form data with one or more `video` file fields.
  Returns `{ success: true, files: [{ path, url }] }`. Invalid requests return 400
  (or 413 for an oversized declared request). Conversion or storage failures return
  500 with a message and any files already uploaded, allowing partial uploads to be seen.
- `GET /api/list`: returns `{ videos: [url, ...] }` for the current UTC year,
  newest first, without response caching.
- `GET /healthz`: readiness endpoint, independent of GCS credentials.

The uploader follows photos' deployment model and has no built-in login. Put it
behind your existing access-controlled ingress if uploads should be private.
Enforce a 101 MiB request-body limit at the ingress, including chunked requests,
and allow enough request time for uploads and conversion. MKV conversion runs
synchronously, one file at a time, with a five-minute timeout per file; the
response arrives after conversion and storage finish. Provide writable temporary
storage for both the source MKV and converted MP4. Temporary files are removed
after success, failure, or cancellation. Multipart parsing buffers the request;
the application validates the 100 MiB source batch limit and streams files to GCS
without making an additional whole-file buffer. Converted output may differ in
size.

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
