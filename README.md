# nextjs-template

A runnable Next.js template for [icco](https://github.com/icco) projects, based on
`natwelch.com`, `lifeline`, `realworldsre.com`, and `go-template`.

## Start a project

```sh
gh repo create icco/my-site --public --template icco/nextjs-template --clone
cd my-site
nvm use
npm install --global pnpm@11.2.2
export NODE_AUTH_TOKEN="$(gh auth token)"
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:8080>.

1. Update the name, description, and repository in `package.json`.
2. Set the site name, description, production URL, repository, and navigation in
   `src/lib/site.ts`. This also drives metadata, canonical URLs, robots, and the
   sitemap. Review the footer options and set `analyticsPath` to enable Web Vitals.
3. Customize `src/app/page.tsx`, `public/icon.svg`, and this README.
4. Confirm Actions are enabled: `gh api repos/icco/my-site/actions/permissions`.
   Complete the GitHub Packages setup below for the new repository.
5. Run the checks below, commit, and push. Main publishes `ghcr.io/icco/my-site:main`.

## Commands

| Command           | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `pnpm dev`        | Development server on port 8080                               |
| `pnpm check`      | ESLint, strict type checking, and formatting checks           |
| `pnpm lint:fix`   | Fix lint and import order                                     |
| `pnpm format`     | Format files and sort Tailwind classes                        |
| `pnpm build`      | Production build with standalone output                       |
| `pnpm start`      | Local production server (`PORT`, default 8080)                |
| `pnpm test:smoke` | Start production server and check routes and security headers |

## Shared components

`@icco/react-common` is installed with `@heroicons/react`, `@wrksz/themes`, and
`jsdom` (needed by the optional XXIIVV ring). Import from the package's component
subpaths to preserve the server/client boundary.

- **Themes:** the root `ThemeProvider` uses `data-theme`, hybrid cookie/localStorage
  persistence, system preference, and light/dark daisyUI themes. `SiteHeader`
  includes the shared `ThemeToggle`. Cookie-based theming makes pages dynamically
  rendered; robots and sitemap remain static. Use `useTheme` or
  `ClientThemeProvider` from `@icco/react-common/ClientThemeProvider` for additional
  client-side controls.
- **Header:** `src/components/Header.tsx` combines `SiteHeader`, the animated
  `Logo`, an accessible home link, and `site.navigation`.
- **Footer:** the shared `Footer` includes copyright, source, Recurse Center, and
  privacy links. Its copyright and personal links refer to Nat Welch. The
  `site.footer` switches expose `Social`, `RecurseRing`, and `XXIIVVRing`; the
  footer includes `RecurseLogo` and `XXIIVVLogo` where appropriate. Social links
  include `/feed.rss`, so add a feed before enabling them. Both rings use
  natwelch.com's membership IDs and fetch external data; enable them only when
  that is appropriate for the new site.
- **Route states:** `loading.tsx` uses `Loading` with an announced status;
  `error.tsx` uses `ErrorMessage` with a retry button. The root layout owns the
  single `<main id="main">` landmark for pages, loading, errors, and 404s.
- **Web Vitals:** set `site.analyticsPath` to the project's reportd path, such as
  `/analytics/my-site`. This mounts `WebVitals` and allows
  `https://reportd.natwelch.com` in CSP `connect-src`. An empty path disables
  reporting. Rebuild after changing it.
- **Styles:** `globals.css` scans the installed shared package for Tailwind
  classes, includes the dynamically named loading sizes, and defines the shared
  social-link hover color.

## GitHub Packages

The committed `.npmrc` sends only the `@icco` scope to GitHub Packages and reads
credentials from `NODE_AUTH_TOKEN`. Locally, use a GitHub token with
`read:packages` (the `gh` token must have that scope). Never commit the token.

Actions use `GITHUB_TOKEN` with package access. In the `@icco/react-common`
package settings, grant the new repository **Actions access** with the **Read**
role. Add a Dependabot secret named `GH_PACKAGES_TOKEN` with `read:packages` so
dependency updates can resolve the scoped package. Template-generated repositories
need their own access and secret configuration.

Docker installs use a BuildKit secret, also wired into CI:

```sh
export NODE_AUTH_TOKEN="$(gh auth token)"
docker build --secret id=npm_token,env=NODE_AUTH_TOKEN -t my-site .
```

The token is available only to the dependency-install step, not in build arguments
or the runtime image.

## Defaults and provenance

- **natwelch.com / lifeline:** App Router under `src/app`, TypeScript, pnpm,
  Tailwind/daisyUI, standalone Docker on port 8080, and security headers.
- **natwelch.com:** Prettier style, import sorting, GHCR publishing with provenance,
  CodeQL, and weekly Dependabot updates. Actions are pinned to commit SHAs.
- **realworldsre.com:** Explicit type-check command.
- ESLint stays on 9 until Next.js's React, import, and accessibility plugins
  support ESLint 10; TypeScript stays on the established 6.0 line.
- **go-template:** Conventional PR titles and documented project initialization.
- CI checks a frozen lockfile, lint, types, formatting, a production build, and
  HTTP smoke tests. PRs build containers; only main publishes them, after CI passes.
- Server Components by default, accessible page landmarks, dark-mode-aware
  daisyUI themes, system fonts, and a health endpoint at `/healthz`.
- CSP allows inline scripts for Next.js hydration and theme initialization; `unsafe-eval` is
  development-only. Caddy supplies HTTPS/HSTS at deployment.

Contentlayer2 remains an optional addition for projects that need Markdown/MDX.
