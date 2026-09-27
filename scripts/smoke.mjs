import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:http"
import { setTimeout } from "node:timers/promises"

import { JSDOM } from "jsdom"

// Set SMOKE_BASE_URL to test a running Docker container instead.
const external = process.env.SMOKE_BASE_URL
const port = process.env.SMOKE_PORT || "18080"
const base = external || `http://127.0.0.1:${port}`
const fixtureNames = [
  "smoke video.mp4",
  "a b.mp4",
  "a%20b.mp4",
  "a%2520b.mp4",
  "a%2Fb.mp4",
  "100%.mp4",
]
const fixturePaths = new Set(fixtureNames.map((name) => `videos/2025/${name}`))
const lookups = []
const currentPrefix = `videos/${new Date().getUTCFullYear()}/`
let listNames = [
  "001.mp4",
  "003.MOV",
  "002.webm",
  "004 a.mp4",
  "005%20b.mp4",
  "readme.txt",
]
let failList = false
let lookupGate = null
const queuedVideo = {
  name: "videos/pending/0000000000001.mkv",
  bucket: "smoke-videos",
  metageneration: "1",
  size: "13",
  metadata: {
    status: "queued",
    originalName: "broken.mkv",
    outputPath: "videos/2025/0000000000001.webm",
  },
}
// Supply GCS fixtures locally without credentials or live writes.
const storage = external
  ? null
  : createServer(async (request, response) => {
      const url = new URL(request.url, "http://localhost")
      if (url.pathname === "/storage/v1/b/smoke-videos/o") {
        if (url.searchParams.get("prefix") === "videos/pending/") {
          response.writeHead(200, { "Content-Type": "application/json" })
          response.end(JSON.stringify({ items: [queuedVideo] }))
          return
        }
        assert.equal(url.searchParams.get("prefix"), currentPrefix)
        response.writeHead(failList ? 403 : 200, {
          "Content-Type": "application/json",
        })
        response.end(
          JSON.stringify(
            failList
              ? { error: { code: 403, message: "Storage unavailable" } }
              : {
                  items: listNames.map((name) => ({
                    name: `${currentPrefix}${name}`,
                    bucket: "smoke-videos",
                  })),
                }
          )
        )
        return
      }
      const prefix = "/storage/v1/b/smoke-videos/o/"
      const path = url.pathname.startsWith(prefix)
        ? decodeURIComponent(url.pathname.slice(prefix.length))
        : null
      if (path === queuedVideo.name && request.method === "PATCH") {
        assert.equal(
          url.searchParams.get("ifMetagenerationMatch"),
          queuedVideo.metageneration
        )
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        Object.assign(
          queuedVideo.metadata,
          JSON.parse(Buffer.concat(chunks)).metadata
        )
        queuedVideo.metageneration = String(
          Number(queuedVideo.metageneration) + 1
        )
        response.writeHead(200, { "Content-Type": "application/json" })
        response.end(JSON.stringify(queuedVideo))
        return
      }
      lookups.push(path)
      if (lookupGate) await lookupGate
      const found = request.method === "GET" && fixturePaths.has(path)
      response.writeHead(found ? 200 : 404, {
        "Content-Type": "application/json",
      })
      response.end(
        JSON.stringify(
          found
            ? { name: path, bucket: "smoke-videos" }
            : { error: { code: 404, message: "Not found" } }
        )
      )
    })
if (storage) {
  storage.listen(0, "127.0.0.1")
  await once(storage, "listening")
}
const server = external
  ? null
  : spawn(process.execPath, ["scripts/start.mjs"], {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: port,
        GCP_BUCKET_NAME: "smoke-videos",
        STORAGE_EMULATOR_HOST: `http://127.0.0.1:${storage.address().port}/storage/v1`,
      },
    })
const exited = server ? once(server, "exit") : null

try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server && server.exitCode !== null)
      throw new Error("Production server exited before readiness")
    try {
      const response = await fetch(`${base}/healthz`, {
        signal: AbortSignal.timeout(1000),
      })
      if (response.ok) {
        ready = true
        break
      }
    } catch {
      /* Wait for startup. */
    }
    await setTimeout(500)
  }
  assert.ok(ready, "Production server becomes ready")
  if (storage) {
    for (
      let attempt = 0;
      attempt < 60 && queuedVideo.metadata.status !== "failed";
      attempt++
    ) {
      await setTimeout(100)
    }
    assert.equal(
      queuedVideo.metadata.status,
      "failed",
      "The background worker claims persisted jobs at startup and records failures"
    )
    const jobs = await fetch(`${base}/api/jobs`)
    assert.equal(jobs.status, 200)
    assert.equal(jobs.headers.get("cache-control"), "no-store")
    assert.deepEqual((await jobs.json()).jobs, [
      { id: "0000000000001.mkv", name: "broken.mkv", status: "failed" },
    ])
  }
  const home = await fetch(base)
  assert.equal(home.status, 200)
  assert.equal(home.headers.get("x-powered-by"), null)
  assert.equal(home.headers.get("x-content-type-options"), "nosniff")
  assert.match(
    home.headers.get("content-security-policy") || "",
    /frame-ancestors 'none'/
  )
  assert.doesNotMatch(
    home.headers.get("content-security-policy") || "",
    /unsafe-eval/
  )
  const document = new JSDOM(await home.text()).window.document
  assert.ok(document.querySelector("h1"))
  assert.equal(document.querySelector("h1").textContent, "Videos")
  assert.ok(
    document.querySelector('input[type="file"][multiple][accept*=".mp4"]')
  )
  assert.equal(
    document.querySelector("video"),
    null,
    "Players only appear on watch pages"
  )
  if (storage) {
    const links = Array.from(
      document.querySelectorAll('section[aria-labelledby="recent-videos"] li a')
    )
    assert.deepEqual(
      links.map((link) => link.textContent),
      ["005%20b.mp4", "004 a.mp4", "003.MOV", "002.webm", "001.mp4"]
    )
    for (const link of links) {
      assert.equal(
        link.getAttribute("href"),
        `/${currentPrefix}${encodeURIComponent(link.textContent)}`
      )
    }
    listNames = []
    const emptyHome = await fetch(base)
    assert.match(await emptyHome.text(), /No videos yet/)
    failList = true
    const failedHome = await fetch(base)
    assert.equal(failedHome.status, 200)
    const failedDocument = new JSDOM(await failedHome.text()).window.document
    assert.match(
      failedDocument.querySelector('[role="alert"]').textContent,
      /Unable to load videos/
    )
    assert.equal(
      failedDocument.querySelector('[role="alert"] button').textContent,
      "Try again"
    )
    assert.ok(
      failedDocument.querySelector('input[type="file"]'),
      "Listing failures leave uploads available"
    )
    failList = false
    listNames = ["006.mp4"]
    const refreshedHome = await fetch(base)
    const refreshedDocument = new JSDOM(await refreshedHome.text()).window
      .document
    assert.equal(
      refreshedDocument.querySelector(
        'section[aria-labelledby="recent-videos"] li a'
      ).textContent,
      "006.mp4",
      "A fresh render includes new uploads without cached listing data"
    )
  }
  assert.match(
    home.headers.get("content-security-policy") || "",
    /media-src 'self' https:\/\/storage.googleapis.com/
  )
  const emptyUpload = await fetch(`${base}/api/upload`, {
    method: "POST",
    body: new FormData(),
  })
  assert.equal(emptyUpload.status, 400)
  assert.match((await emptyUpload.json()).message, /Select at least one video/)
  assert.equal(document.querySelectorAll("main").length, 1)
  assert.ok(document.querySelector('main#main[tabindex="-1"]'))
  assert.ok(document.querySelector('header a[href="/"] .logo svg'))
  assert.ok(document.querySelector('header a[aria-label="About"] svg'))
  assert.ok(document.querySelector('header input[type="checkbox"]'))
  assert.ok(document.querySelector('footer a[title="Source Code"]'))
  assert.ok(document.querySelector('footer a[title="GitHub"]'))
  assert.ok(document.querySelector('footer a[title="RSS Feed"]'))
  assert.match(document.querySelector("footer").textContent, /Nat Welch/)
  const feed = await fetch(`${base}/feed.rss`, { redirect: "manual" })
  assert.equal(feed.status, 308)
  assert.equal(feed.headers.get("location"), "https://natwelch.com/feed.rss")
  for (const theme of ["light", "dark"]) {
    const themed = await fetch(base, { headers: { cookie: `theme=${theme}` } })
    assert.equal(themed.status, 200)
    const themedDom = new JSDOM(await themed.text(), {
      url: base,
      runScripts: "outside-only",
      pretendToBeVisual: true,
    })
    themedDom.window.document.cookie = `theme=${theme}`
    // Run only the pre-hydration theme script, not Next.js bootstrap scripts.
    const themeScript = Array.from(
      themedDom.window.document.querySelectorAll("script")
    ).find((script) => script.textContent.includes('"data-theme"'))
    assert.ok(themeScript, "Theme initialization is included in the response")
    themedDom.window.eval(themeScript.textContent)
    assert.equal(
      themedDom.window.document.documentElement.getAttribute("data-theme"),
      theme,
      `The saved ${theme} preference is applied before hydration`
    )
    themedDom.window.close()
  }
  const health = await fetch(`${base}/healthz`)
  assert.deepEqual(await health.json(), { status: "ok" })
  assert.equal(health.headers.get("cache-control"), "no-store")
  const robots = await fetch(`${base}/robots.txt`)
  assert.equal(robots.status, 200)
  assert.match(await robots.text(), /Sitemap: https:\/\//)
  const sitemap = await fetch(`${base}/sitemap.xml`)
  assert.equal(sitemap.status, 200)
  assert.match(await sitemap.text(), /<urlset/)
  assert.equal((await fetch(`${base}/icon.svg`)).status, 200)
  async function checkMissingVideo(path) {
    const response = await fetch(`${base}${path}`)
    // Next.js can send the loading shell before resolving notFound().
    assert.ok([200, 404].includes(response.status))
    const html = await response.text()
    const document = new JSDOM(html).window.document
    assert.ok(document.querySelector('meta[name="robots"][content="noindex"]'))
    assert.match(html, /Page not found/)
    assert.equal(document.querySelector("video"), null)
  }
  await checkMissingVideo("/videos/invalid/video.mp4")
  if (storage) {
    let resumeLookup
    lookupGate = new Promise((resolve) => {
      resumeLookup = resolve
    })
    let reader
    let streamedHtml = ""
    const decoder = new TextDecoder()
    try {
      const streamingWatch = await fetch(
        `${base}/videos/2025/smoke%20video.mp4`,
        {
          signal: AbortSignal.timeout(10000),
        }
      )
      assert.equal(streamingWatch.status, 200)
      reader = streamingWatch.body.getReader()
      while (!streamedHtml.includes("Loading video…")) {
        const { done, value } = await reader.read()
        assert.equal(
          done,
          false,
          "The watch skeleton arrives while storage is still pending"
        )
        streamedHtml += decoder.decode(value, { stream: true })
      }
      assert.equal(
        new JSDOM(streamedHtml).window.document.querySelector("video"),
        null
      )
    } finally {
      resumeLookup()
      lookupGate = null
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      streamedHtml += decoder.decode(value, { stream: true })
    }
    streamedHtml += decoder.decode()
    assert.ok(
      new JSDOM(streamedHtml).window.document.querySelector("video[controls]"),
      "The player streams after the lookup completes"
    )
    // Keep both space and literal percent-escape names in storage so incorrect
    // decoding cannot silently play a different, existing video.
    for (const filename of fixtureNames) {
      const watchPath = `/videos/2025/${encodeURIComponent(filename)}`
      const lookupStart = lookups.length
      const watch = await fetch(`${base}${watchPath}`)
      assert.equal(watch.status, 200)
      const watchDom = new JSDOM(await watch.text())
      const watchDocument = watchDom.window.document
      assert.deepEqual(
        [...new Set(lookups.slice(lookupStart))],
        [`videos/2025/${filename}`],
        `Page and metadata must look up the exact filename: ${filename}`
      )
      assert.equal(watchDocument.querySelectorAll("main").length, 1)
      assert.equal(watchDocument.querySelector("h1")?.textContent, filename)
      assert.equal(watchDocument.title, `${filename} | Videos`)
      const player = watchDocument.querySelector("video[controls][playsinline]")
      assert.ok(player)
      assert.equal(player.getAttribute("preload"), "metadata")
      assert.ok(player.getAttribute("src").endsWith(watchPath))
      assert.equal(
        watchDocument.querySelector('a[target="_blank"][class="link"]').href,
        player.getAttribute("src")
      )
      assert.equal(
        watchDocument.querySelector('meta[property="og:video"]').content,
        player.getAttribute("src")
      )
      assert.ok(watchDocument.querySelector('a[href="/"][class="link"]'))
      assert.equal(
        watchDocument.querySelector('link[rel="canonical"]').href,
        `https://videos.natwelch.com${watchPath}`
      )
      watchDom.window.close()
    }
    await checkMissingVideo("/videos/2025/missing.mp4")
  }
  const missing = await fetch(`${base}/this-page-does-not-exist`)
  assert.equal(missing.status, 404)
  const missingDocument = new JSDOM(await missing.text()).window.document
  assert.equal(missingDocument.querySelectorAll("main").length, 1)
  assert.ok(missingDocument.querySelector("header"))
  assert.ok(missingDocument.querySelector("footer"))
  console.log("Production smoke checks passed.")
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM")
    const forceKill = globalThis.setTimeout(() => server.kill("SIGKILL"), 5000)
    await exited
    globalThis.clearTimeout(forceKill)
  }
  if (storage) await new Promise((resolve) => storage.close(resolve))
}
