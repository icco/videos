# Videos

A video uploader and gallery at [videos.natwelch.com](https://videos.natwelch.com).

- Accepts MP4, M4V, MOV, WebM, OGV, and MKV: up to 10 files and 2 GiB per batch.
- Stores uploads in Google Cloud Storage, then converts them to WebM (AV1/Opus) in the background. You can close the page after uploading and retry failed jobs later. Subtitles and extra tracks are omitted.
- Shows the current year's videos newest first, with shareable watch pages for videos from any year.

Built with Next.js, React, and TypeScript.

## Development

Use Node 26 and the pnpm version pinned in `package.json`. Configure a GitHub
Packages token with `read:packages` access to `@icco/react-common` in your
user-level `~/.npmrc`, then run `pnpm install` and `pnpm dev`. The repository's
`.npmrc` only routes `@icco` packages to GitHub Packages, so local installs and
upgrades inherit your user-level credentials.

CI configures authentication through `actions/setup-node` and `NODE_AUTH_TOKEN`.
Docker builds accept the token through the `npm_token` BuildKit secret.
