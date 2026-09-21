/** Exercise the saved manufacturing template inside Sites and as an exported standalone website. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Verify creation, navigation, filtering and inquiry drafting from the shipped Sites panel.
 * @param page - Authenticated browser displaying the Sites welcome screen.
 * @param context - Same browser context, including the authenticated request client.
 * @param endpoint - Enterprise Sites endpoint.
 * @param evidence - Unique test output directory.
 * @returns Resolves after the saved and exported template interactions pass.
 */
export async function verifyManufacturing(page, context, endpoint, evidence) {
  const editorViewport = page.viewportSize()
  const blocked = await context.request.get(`${endpoint}?action=starter`)
  assert.equal(blocked.status(), 405)
  const invalid = await context.request.post(`${endpoint}?action=starter`, { data: { name: 'Invalid', template: { id: 'manufacturing', version: '1.0.0', parameters: { style: 'unknown' } } } })
  assert.equal(invalid.status(), 400)
  await page.getByRole('button', { name: '从制造业模板开始', exact: true }).click()
  const frame = page.frameLocator('iframe[title="预览"]')
  await frame.getByRole('heading', { name: 'Precision in every part. Clarity in every step.' }).waitFor()
  await frame.getByRole('link', { name: 'Explore our products' }).click()
  await frame.getByRole('button', { name: 'Linear motion', exact: true }).click()
  assert.equal(await frame.locator('.product-card:visible').count(), 1)
  await frame.locator('.product-card:visible a').click()
  await frame.getByRole('heading', { name: 'Linear guides', exact: true }).waitFor()
  await frame.getByRole('link', { name: 'Discuss this product' }).click()
  await frame.getByLabel('Product interest').waitFor()
  assert.equal(await frame.getByLabel('Product interest').inputValue(), 'Linear guides')
  const list = await (await context.request.get(endpoint)).json()
  const site = list.items.find(item => item.name === 'Northline 制造企业官网')
  assert.ok(site?.currentRevisionId)
  const content = await (await context.request.get(`${endpoint}?siteId=${site.id}&action=content&revisionId=${site.currentRevisionId}`)).json()
  const cases = [{ style: 'industrial', files: content.project.files }]
  for (const style of ['precision', 'international']) {
    await page.getByRole('button', { name: '新建网站', exact: true }).click()
    await page.getByLabel('网站风格').selectOption(style)
    await page.getByText('其他创建方式', { exact: true }).click()
    await page.getByLabel('品牌名称', { exact: true }).fill('Acme Motion')
    const createdResponse = page.waitForResponse(response => response.url().includes('action=starter') && response.request().method() === 'POST')
    await page.getByRole('button', { name: '从制造业模板开始', exact: true }).click()
    const created = await (await createdResponse).json()
    await frame.locator('body.theme-' + style).waitFor()
    assert.equal(await frame.locator('header .brand').innerText(), 'ACME MOTION\nPRECISION COMPONENTS')
    const result = await (await context.request.get(endpoint + '?siteId=' + created.id + '&action=content&revisionId=' + created.currentRevisionId)).json()
    cases.push({ style, files: result.project.files })
  }
  let files = content.project.files
  const directory = join(evidence, 'manufacturing')
  for (const file of files) {
    const path = join(directory, file.path)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8'))
  }
  const exportedContext = await context.browser().newContext({ viewport: { width: 1440, height: 1000 } })
  const standalone = await exportedContext.newPage()
  const errors = []
  standalone.on('pageerror', error => errors.push(error.message))
  await standalone.route('**/*', async route => {
    const url = new URL(route.request().url())
    assert.equal(url.origin, 'http://manufacturing.test', 'Template must use saved local assets')
    const path = url.pathname.endsWith('/') ? `${url.pathname.slice(1)}index.html` : url.pathname.slice(1)
    const file = files.find(item => item.path === path)
    if (!file) { await route.fulfill({ status: 404, body: 'Not found' }); return }
    const type = { html: 'text/html', css: 'text/css', js: 'text/javascript', jpg: 'image/jpeg' }[path.split('.').at(-1)]
    await route.fulfill({ status: 200, contentType: type, body: Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8') })
  })
  try {
    for (const variant of cases) {
      files = variant.files
      for (const width of [1440, 390]) {
        await standalone.setViewportSize({ width, height: 1000 })
        for (const file of files.filter(item => item.path.endsWith('.html'))) {
          await standalone.goto(`http://manufacturing.test/${file.path}`)
          assert.equal(await standalone.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${file.path} at ${width}px`)
          assert.equal(await standalone.locator('h1').count(), 1)
          assert.equal(await standalone.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true)
          if (file.path === 'index.html' || file.path === 'products/index.html' || file.path === 'contact/index.html') await standalone.screenshot({ path: join(evidence, `manufacturing-${variant.style}-${file.path.split('/')[0].replace('.html', '')}-${width}.png`), fullPage: true })
        }
      }
    }
    await standalone.goto('http://manufacturing.test/')
    await standalone.getByRole('button', { name: 'Menu' }).click()
    await standalone.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Products', exact: true }).click()
    await standalone.getByRole('button', { name: 'Custom machining', exact: true }).click()
    assert.equal(await standalone.locator('.product-card:visible').count(), 1)
    await standalone.locator('.product-card:visible a').click()
    await standalone.getByRole('link', { name: 'Discuss this product' }).click()
    assert.equal(await standalone.getByLabel('Product interest').inputValue(), 'Machined housings')
    await standalone.getByLabel('Your name').fill('Sample buyer')
    await standalone.getByLabel('Business email').fill('buyer@example.test')
    await standalone.getByLabel('Company', { exact: true }).fill('Example Engineering')
    await standalone.getByLabel('Project requirements').fill('Drawing R2; prototype review; stainless material.')
    await standalone.getByRole('checkbox').check()
    await standalone.getByRole('button', { name: 'Prepare inquiry draft' }).click()
    assert.match(await standalone.getByLabel('Review and copy the draft').inputValue(), /Machined housings/)
    assert.match(await standalone.getByRole('status').innerText(), /No message has been sent/)
    await standalone.reload()
    assert.equal(await standalone.locator('#inquiry-output').isVisible(), false)
    assert.deepEqual(errors, [])
  } finally {
    await exportedContext.close()
    await page.bringToFront()
    // Chromium can retain the last page's physical window size after closing a mobile preview.
    if (editorViewport) await page.setViewportSize(editorViewport)
  }
}
