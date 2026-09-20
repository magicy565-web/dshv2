/** Browser acceptance shared by live generation and inspection of its saved evidence. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildStaticSite } from '../../../packages/site/site/lib/types/project.js'
import { renderStaticPreview } from '../../../packages/site/site/lib/types/preview.js'
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

/** Verify rendered branding, interaction and responsive layout without external resources.
 * @param project - Persisted static project.
 * @param name - Requested brand name; line breaks, case and typographic ampersands may vary.
 * @param evidence - Existing directory for HTML and successful screenshots.
 * @param revisionId - Saved revision identity used for the build.
 */
export async function verifySiteBrowser(project, name, evidence, revisionId) {
  const response = await renderStaticPreview(buildStaticSite(revisionId, project), '/', String, 1048576)
  const html = await response.text()
  await writeFile(join(evidence, 'index.html'), html)
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium', headless: true })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => route.request().url() === 'https://sites-test.invalid/'
      ? route.fulfill({ body: html, headers: Object.fromEntries(response.headers) }) : route.abort())
    const brand = value => value.replace(/&/g, 'and').replace(/\s+/g, ' ').toLowerCase()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('https://sites-test.invalid/')
      const heading = page.getByRole('heading', { level: 1 }).first()
      await heading.waitFor()
      assert.ok(brand(await heading.innerText()).includes(brand(name)))
      await page.locator('#demo-action').click()
      assert.equal(await page.locator('#demo-result').innerText(), 'Ready')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.screenshot({ path: join(evidence, width === 1440 ? 'desktop.png' : 'mobile.png'), fullPage: true })
    }
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
}
