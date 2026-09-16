/** Browser layout evidence for deterministic previews, not a public-deployment or model-flow test. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { productFixture } from './geo-fixture.mjs'
import { productPreview } from '../src/geo-preview.ts'

test('product preview renders matching facts without overflow on desktop and mobile', async t => {
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium', headless: true })
  t.after(() => browser.close())
  const directory = fileURLToPath(new URL('../../../.trade-runtime/geo-evidence/', import.meta.url))
  await mkdir(directory, { recursive: true })
  const product = productFixture()
  const preview = productPreview({ kind: 'product', name: 'R-821 Printed Rayon Challis', status: 'confirmed', confirmedAt: '2026-09-14T00:00:00Z', productVerifiedAt: '2026-09-14T00:00:00Z', product }, new Date('2026-09-15T00:00:00Z'))
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } })
    await page.setContent(preview.html)
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'R-821 Printed Rayon Challis')
    assert.equal(await page.getByText('120 g/m²', { exact: true }).count(), 1)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true })
    await page.close()
  }
})
