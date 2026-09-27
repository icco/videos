import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { setTimeout } from "node:timers/promises"

import { JSDOM } from "jsdom"

// Set SMOKE_BASE_URL to test a running Docker container instead.
const external = process.env.SMOKE_BASE_URL
const port = process.env.SMOKE_PORT || "18080"
const base = external || `http://127.0.0.1:${port}`
const server = external
  ? null
  : spawn(process.execPath, ["scripts/start.mjs"], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production", PORT: port },
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
  assert.equal(document.querySelectorAll("main").length, 1)
  assert.ok(document.querySelector('main#main[tabindex="-1"]'))
  assert.ok(document.querySelector('header a[aria-label$=" home"] svg'))
  assert.ok(document.querySelector('header input[type="checkbox"]'))
  assert.ok(document.querySelector('footer a[title="Source Code"]'))
  assert.match(document.querySelector("footer").textContent, /Nat Welch/)
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
}
