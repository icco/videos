# Videos

A video uploader and index for `videos.natwelch.com`, following
[icco/photos](https://github.com/icco/photos) and built on
[icco/nextjs-template](https://github.com/icco/nextjs-template).

## Features

- Multi-file uploads to Google Cloud Storage under `videos/<UTC year>/<TSID>.<ext>`.
- Server-rendered current-year filename index, newest first, refreshed after uploads.
- Shareable watch pages at `/videos/<year>/<filename>`, including past years.
- Native video controls, inline mobile playback, and original-file links on watch pages.
- Watch-page streaming with a player-shaped loading skeleton.
- MP4, M4V, WebM, MOV, OGV, and MKV uploads; up to 10 files and 100 MiB per batch.
- Empty, retry, upload-in-progress, success, and failure states.
- Shared header/footer, light/dark themes, and Web Vitals, like the photos site.
- Strict TypeScript, CI, CodeQL, Dependabot, and a non-root standalone Docker image.

Videos are stored as uploaded; no transcoding is performed. Browser playback
depends on the container and codec. Prefer H.264 MP4 or WebM for broad support;
other formats remain accessible through their original-file links.

## Development

Use Node 26 and pnpm 11.2.2:

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
  (or 413 for an oversized declared request). Storage failures return 500 with a
  message and any files already uploaded, allowing partial uploads to be seen.
- `GET /api/list`: returns `{ videos: [url, ...] }` for the current UTC year,
  newest first, without response caching.
- `GET /healthz`: readiness endpoint, independent of GCS credentials.

The uploader follows photos' deployment model and has no built-in login. Put it
behind your existing access-controlled ingress if uploads should be private.
Enforce a 101 MiB request-body limit at the ingress, including chunked requests,
and allow enough request time for uploads. Multipart parsing buffers the request;
the application validates the 100 MiB batch limit and streams files to GCS
without making an additional whole-file buffer.

## Checks

```sh
pnpm check
pnpm test
pnpm build
pnpm test:smoke
```

API tests use mocked storage, so checks require no GCP credentials or live writes.
`pnpm format` and `pnpm lint:fix` apply formatting and import-order fixes.

All application and configuration changes go through pull requests.
