# Project guidance

Next.js App Router, React, strict TypeScript, Tailwind CSS, and daisyUI.

- Use Node 26 and the pnpm version pinned in `package.json`.
- Routes live in `src/app/`; reusable components belong in `src/components/` and utilities in `src/lib/`.
- Prefer Server Components; add `"use client"` only for browser APIs or interactivity.
- Site identity and canonical origin live in `src/lib/site.ts`.
- Shared UI comes from `@icco/react-common` component subpaths. Configure navigation, footer features, and analytics in `src/lib/site.ts`; the root layout owns the main landmark.
- Package installs need `NODE_AUTH_TOKEN` with GitHub Packages read access; Docker accepts it via the `npm_token` BuildKit secret.
- Use two spaces, double quotes, and no semicolons; Prettier sorts Tailwind classes and ESLint sorts imports.
- Run `pnpm check`, `pnpm build`, and `pnpm test:smoke` before submitting changes.
- Keep secrets server-side and out of git and Docker build arguments.
- Docker serves standalone output as a non-root user on port 8080.
- Commits and PR titles use Conventional Commits with lowercase subjects.
