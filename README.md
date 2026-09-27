# Videos

A video uploader and gallery at [videos.natwelch.com](https://videos.natwelch.com).

- Accepts MP4, M4V, MOV, WebM, OGV, and MKV: up to 10 files and 2 GiB per batch.
- Converts every new upload to WebM (AV1 video and Opus audio) using FFmpeg and
  stores the converted file in Google Cloud Storage. Subtitles and extra tracks
  are omitted.
- Shows the current year's videos newest first, with shareable watch pages for
  videos from any year.

Built with Next.js, React, and TypeScript.
