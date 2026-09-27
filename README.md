# Videos

A video uploader and gallery at [videos.natwelch.com](https://videos.natwelch.com).

- Accepts MP4, M4V, MOV, WebM, OGV, and MKV: up to 10 files and 2 GiB per batch.
- Stores uploads in Google Cloud Storage, then converts them to WebM (AV1/Opus) in the background. You can close the page after uploading and retry failed jobs later. Subtitles and extra tracks are omitted.
- Shows the current year's videos newest first, with shareable watch pages for videos from any year.

Built with Next.js, React, and TypeScript.
