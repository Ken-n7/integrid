// Manual artwork export, not a build dependency. Requires Playwright and Chromium.
// Set PLAYWRIGHT_MODULE and CHROME_PATH when using an existing external installation.
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost')
    const file = pathname === '/' ? 'scripts/social-card.html'
      : pathname === '/fonts/nunito.woff2' ? 'node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2'
      : pathname.startsWith('/art/') && pathname.endsWith('.webp') ? `public${pathname}` : null
    if (!file) { res.writeHead(404); res.end(); return }
    res.setHeader('Content-Type', file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.webp') ? 'image/webp' : 'text/html; charset=utf-8')
    res.end(await readFile(path.join(root, file)))
  } catch { res.writeHead(404); res.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())) })
  assert.deepEqual(errors, [])
  assert.equal(await page.evaluate(() => document.fonts.check('900 40px Nunito')), true)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1200)
  const output = path.join(root, 'public/social/integrid-share-v1.png')
  await mkdir(path.dirname(output), { recursive: true })
  await page.screenshot({ path: output, type: 'png' })
  const image = await readFile(output)
  assert.equal(image.readUInt32BE(16), 1200); assert.equal(image.readUInt32BE(20), 630)
  console.log(`Exported ${path.relative(root, output)} (1200 × 630, ${Math.round(image.length / 1024)} KiB)`)
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
