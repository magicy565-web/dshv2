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
  await page.getByRole('checkbox', { name: '接入自托管 Umami 流量统计' }).check()
  await page.getByLabel('Umami 脚本地址').fill('https://metrics.example.test/script.js')
  await page.getByLabel('Umami 网站 ID').fill('00000000-0000-4000-8000-000000000001')
  await page.getByLabel('Umami 私有报表地址').fill('https://metrics.example.test/websites/00000000-0000-4000-8000-000000000001')
  await page.getByRole('checkbox', { name: '启用官网产品咨询 Agent' }).check()
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
    const analytics = []
    await visitorContext.route('https://metrics.example.test/script.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.umami = { track: function(name) { return fetch('https://metrics.example.test/api/send', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify(window.siteAnalyticsBeforeSend('event', { url: location.href, referrer: document.referrer, name: name })) }); } }; window.umami.track();` }))
    await visitorContext.route('https://metrics.example.test/api/send', async route => {
      if (route.request().method() === 'POST') analytics.push(route.request().postDataJSON())
      await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }, body: '{}' })
    })
    const errors = []
    visitor.on('pageerror', error => errors.push(error.message))
    const response = await visitor.goto(url + '?utm_source=ai-search&utm_medium=referral&utm_campaign=launch&token=private')
    assert.equal(response.status(), 200)
    assert.match(response.headers()['content-security-policy'], /sandbox allow-scripts allow-forms;/)
    assert.equal(await visitor.locator('body').evaluate(() => { try { void document.cookie; return false } catch { return true } }), true)
    assert.equal(await visitor.locator('link[rel=canonical]').getAttribute('href'), url)
    assert.match(await (await visitorContext.request.get(new URL('sitemap.xml', url).href)).text(), /consult\//)
    assert.match(await (await visitorContext.request.get(new URL('/robots.txt', url).href)).text(), new RegExp(new URL(url).pathname + 'sitemap.xml'))
    await visitor.screenshot({ path: join(evidence, 'company-live-desktop.png'), fullPage: true })
    await visitor.setViewportSize({ width: 390, height: 844 })
    assert.equal(await visitor.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await visitor.getByRole('button', { name: 'Menu', exact: true }).click()
    await visitor.getByRole('navigation').getByRole('link', { name: 'Ask AI', exact: true }).click()
    assert.equal(new URL(visitor.url()).searchParams.get('utm_source'), 'ai-search')
    await visitor.getByLabel('Your question').fill('What do you supply?')
    await visitor.getByRole('button', { name: 'Ask a question', exact: true }).click()
    await visitor.locator('#consultation-answers').getByText(/We supply precision components/).waitFor()
    assert.equal(await visitor.locator('#consultation-answers script').count(), 0)
    await visitor.getByRole('button', { name: 'Prepare an inquiry from this conversation' }).click()
    assert.match(await visitor.getByLabel('Requirements', { exact: true }).inputValue(), /What do you supply/)
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
    const trackedReceipt = visitor.waitForResponse(request => request.url() === 'https://metrics.example.test/api/send' && request.request().method() === 'POST' && request.request().postDataJSON()?.name === 'inquiry_received')
    await visitor.getByRole('button', { name: 'Send inquiry', exact: true }).click()
    await visitor.getByRole('status').filter({ hasText: 'Inquiry received. Reference:' }).waitFor()
    await trackedReceipt
    assert.ok(analytics.some(event => event.name === 'consultation_answered'))
    assert.ok(analytics.every(event => !JSON.stringify(event).includes('token=private')))
    assert.ok(analytics.some(event => event.url.includes('utm_source=ai-search')))
    assert.equal(await visitor.getByLabel('Email', { exact: true }).inputValue(), '')
    await visitor.screenshot({ path: join(evidence, 'company-inquiry-mobile.png'), fullPage: true })
    await page.getByRole('button', { name: '刷新发布与询盘' }).click()
    await page.getByText('共 1 条询盘，显示最近 100 条。', { exact: true }).waitFor()
    await page.getByText('Visitor Alice', { exact: true }).waitFor()
    await page.getByText(/访客报告的来源.*ai-search/).waitFor()
    await page.getByRole('button', { name: '标记已读', exact: true }).click()
    await page.getByText('已读', { exact: true }).waitFor()
    await page.getByLabel('跟进负责人').fill('Sales owner')
    await page.getByRole('button', { name: '创建跟进任务', exact: true }).click()
    await page.getByText('跟进任务已创建，可在企业任务列表中管理。', { exact: true }).waitFor()
    const operations = page.locator('.site-operations')
    await operations.getByRole('button', { name: '读取当前配置', exact: true }).click()
    await operations.getByLabel('主语言（不会自动翻译内容）').selectOption('zh-CN')
    await operations.getByText('多语言内容', { exact: true }).click()
    await operations.getByRole('button', { name: '手动准备另一语言', exact: true }).click()
    await operations.getByRole('checkbox', { name: '我已检查以上资料和联系方式，确认可以用于公开官网。' }).check()
    await operations.getByRole('button', { name: '保存配置并生成官网新草稿', exact: true }).click()
    await page.frameLocator('iframe[title="预览"]').locator('html[lang="zh-CN"]').waitFor()
    assert.match(await (await visitorContext.request.get(url)).text(), /lang="en"/)
    await page.getByRole('button', { name: '检查本地发布版本' }).click()
    await page.getByRole('checkbox', { name: '我已检查此版本，确认其中内容可以公开。' }).check()
    await page.getByRole('button', { name: '发布到当前服务' }).click()
    await page.getByRole('button', { name: '检查本地发布版本' }).waitFor({ state: 'visible' })
    await visitor.goto(url)
    await visitor.getByRole('button', { name: '菜单', exact: true }).click()
    await visitor.getByRole('navigation').getByRole('link', { name: 'English', exact: true }).click()
    assert.equal(new URL(visitor.url()).pathname, new URL('en/', url).pathname)
    await visitor.locator('html[lang="en"]').waitFor()
    assert.equal(await visitor.locator('link[rel=alternate][hreflang="zh-CN"]').getAttribute('href'), url)
    await page.screenshot({ path: join(evidence, 'company-operations.png'), fullPage: true })
    await page.getByRole('button', { name: '下线网站', exact: true }).click()
    await live.waitFor({ state: 'detached' })
    assert.equal((await visitorContext.request.get(url)).status(), 404)
    assert.deepEqual(errors, [])
  } finally { await visitorContext.close(); await page.bringToFront(); await page.setViewportSize({ width: 1440, height: 1000 }) }
}
