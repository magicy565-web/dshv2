/** Real-profile proof: reviewed company data reaches a public page and a visitor's retry creates one inbox record. */
import assert from 'node:assert/strict'
import { join } from 'node:path'

/** Exercise company review, local publication, browser inquiry retries and private inbox processing.
 * @param page - Authenticated workspace browser.
 * @param context - Authenticated request context.
 * @param endpoint - Enterprise Sites URL.
 * @param evidence - Per-run screenshot directory.
 */
export async function verifyCompanySite(page, context, endpoint, evidence) {
  const profile = { name: 'Acme Engineering', kind: 'enterprise', description: 'Precision components developed for industrial assemblies and customer drawings.', business: 'Industrial components', website: '', contact: 'Internal contact', email: 'sales@example.test', phone: '+1 555 0100', address: 'Example Industrial Park', logoId: null }
  const saved = await context.request.post(new URL('/api/enterprise/profile', endpoint).href, { data: profile })
  assert.equal(saved.status(), 200, await saved.text())
  await page.getByRole('button', { name: 'Sites', exact: true }).click()
  await page.getByRole('button', { name: '新建网站', exact: true }).click()
  await page.getByLabel('网站风格').selectOption('precision')
  await page.getByRole('button', { name: '读取并检查企业资料', exact: true }).click()
  await page.getByRole('heading', { name: profile.name, exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '生成企业官网草稿' }).isDisabled(), true)
  await page.getByRole('checkbox', { name: '我已检查以上资料和联系方式，确认可以用于公开官网。' }).check()
  await page.getByRole('button', { name: '生成企业官网草稿' }).click()
  await page.frameLocator('iframe[title="预览"]').getByRole('heading', { name: profile.name, exact: true }).first().waitFor()
  await page.getByRole('button', { name: '检查本地发布版本' }).click()
  await page.getByRole('checkbox', { name: '我已检查此版本，确认其中内容可以公开。' }).check()
  await page.getByRole('button', { name: '发布到当前服务' }).click()
  const live = page.getByRole('link', { name: '打开网站', exact: true })
  await live.waitFor()
  const url = new URL(await live.getAttribute('href'), endpoint).href
  const visitorContext = await context.browser().newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    const visitor = await visitorContext.newPage()
    const errors = []
    visitor.on('pageerror', error => errors.push(error.message))
    const response = await visitor.goto(url)
    assert.equal(response.status(), 200)
    assert.match(response.headers()['content-security-policy'], /sandbox allow-scripts allow-forms;/)
    assert.equal(await visitor.locator('body').evaluate(() => { try { void document.cookie; return false } catch { return true } }), true)
    await visitor.screenshot({ path: join(evidence, 'company-live-desktop.png'), fullPage: true })
    await visitor.setViewportSize({ width: 390, height: 844 })
    assert.equal(await visitor.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await visitor.getByRole('button', { name: 'Menu', exact: true }).click()
    await visitor.getByRole('navigation').getByRole('link', { name: 'Contact', exact: true }).click()
    await visitor.getByLabel('Name', { exact: true }).fill('Visitor Alice')
    await visitor.getByLabel('Email', { exact: true }).fill('alice@example.test')
    await visitor.getByLabel('Company', { exact: true }).fill('Buyer Company')
    await visitor.getByLabel('Requirements', { exact: true }).fill('Please quote the supplied drawing and shipment options.')
    await visitor.getByRole('checkbox').check()
    const inquiryUrl = new URL('_inquiries', url).href
    let dropped = false
    await visitorContext.route(inquiryUrl, async route => {
      if (route.request().method() !== 'POST' || dropped) { await route.continue(); return }
      const received = await route.fetch()
      assert.equal(received.status(), 201)
      dropped = true
      await route.abort('failed')
    })
    await visitor.getByRole('button', { name: 'Send inquiry', exact: true }).click()
    await visitor.getByRole('status').filter({ hasText: 'Receipt could not be confirmed' }).waitFor()
    await visitor.getByRole('button', { name: 'Send inquiry', exact: true }).click()
    await visitor.getByRole('status').filter({ hasText: 'Inquiry received. Reference:' }).waitFor()
    assert.equal(await visitor.getByLabel('Email', { exact: true }).inputValue(), '')
    await visitor.screenshot({ path: join(evidence, 'company-inquiry-mobile.png'), fullPage: true })
    await page.getByRole('button', { name: '刷新发布与询盘' }).click()
    await page.getByText('共 1 条询盘，显示最近 100 条。', { exact: true }).waitFor()
    await page.getByText('Visitor Alice', { exact: true }).waitFor()
    await page.getByRole('button', { name: '标记已读', exact: true }).click()
    await page.getByText('已读', { exact: true }).waitFor()
    await page.screenshot({ path: join(evidence, 'company-inbox.png'), fullPage: true })
    await page.getByRole('button', { name: '下线网站', exact: true }).click()
    await live.waitFor({ state: 'detached' })
    assert.equal((await visitorContext.request.get(url)).status(), 404)
    assert.deepEqual(errors, [])
  } finally { await visitorContext.close(); await page.bringToFront(); await page.setViewportSize({ width: 1440, height: 1000 }) }
}
