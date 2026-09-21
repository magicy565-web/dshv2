/** Saved source, Session activity and reversible management through the real Host. */
import assert from 'node:assert/strict'

/** Exercise management controls without any external publication.
 * @param {import('playwright').Page} page - Authenticated workspace page.
 * @param {import('playwright').BrowserContext} context - Owning browser context.
 * @param {string} endpoint - Enterprise Sites URL.
 */
export async function verifySiteManagement(page, context, endpoint) {
  const created = await context.request.post(endpoint, { data: { name: 'Management proof' } })
  assert.equal(created.status(), 201)
  const site = await created.json()
  const url = `${endpoint}?siteId=${site.id}`
  const project = text => ({ framework: 'static', files: [{ path: 'index.html', content: `<h1>${text}</h1>`, encoding: 'utf8' }] })
  const first = await (await context.request.post(`${url}&action=revisions`, { data: { changeSet: { project: project('Before review') } } })).json()
  assert.equal((await context.request.post(`${url}&action=revisions`, { data: { changeSet: { baseRevisionId: first.id, project: project('After review') } } })).status(), 201)
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await page.getByRole('button', { name: /Management proof/ }).click()
  await page.getByRole('button', { name: '版本对比', exact: true }).click()
  await page.locator('.site-diff summary').filter({ hasText: 'index.html' }).click()
  assert.match(await page.locator('.site-diff-columns').innerText(), /Before review/)
  assert.match(await page.locator('.site-diff-columns').innerText(), /After review/)
  await page.getByRole('button', { name: '活动记录', exact: true }).click()
  await page.getByText('活动来自已持久保存的站点 Session', { exact: false }).waitFor()
  const activity = await context.request.get(`${url}&action=activity`)
  assert.equal(activity.status(), 200, await activity.text())
  const journal = await activity.json()
  assert.equal(journal.events.length, 3)
  assert.equal(journal.state.revisions.length, 2)
  await page.locator('summary').filter({ hasText: /^管理网站$/ }).click()
  await page.getByRole('textbox', { name: '网站名称', exact: true }).fill('Renamed proof')
  await page.getByRole('button', { name: '重命名', exact: true }).click()
  await page.getByRole('heading', { name: 'Renamed proof', exact: true }).waitFor()
  await page.locator('summary').filter({ hasText: /^管理网站$/ }).click()
  await page.getByRole('button', { name: '归档网站', exact: true }).click()
  await page.getByRole('button', { name: '确认操作', exact: true }).click()
  await page.getByRole('button', { name: /Renamed proof.*已归档/ }).waitFor()
  await page.getByRole('button', { name: '源码', exact: true }).click()
  assert.equal(await page.getByRole('textbox', { name: '源码', exact: true }).isDisabled(), true)
  await page.locator('summary').filter({ hasText: /^管理网站$/ }).click()
  await page.getByRole('button', { name: '恢复网站', exact: true }).click()
  await page.getByRole('button', { name: /Renamed proof.*草稿/ }).waitFor()
  await page.locator('summary').filter({ hasText: /^管理网站$/ }).click()
  await page.getByRole('button', { name: '归档网站', exact: true }).click()
  await page.getByRole('button', { name: '确认操作', exact: true }).click()
  await page.getByRole('button', { name: /Renamed proof.*已归档/ }).waitFor()
  await page.locator('summary').filter({ hasText: /^管理网站$/ }).click()
  await page.getByRole('button', { name: '删除网站', exact: true }).click()
  await page.getByRole('button', { name: '确认操作', exact: true }).click()
  await page.getByRole('button', { name: /Renamed proof/ }).waitFor({ state: 'detached' })
  assert.equal((await context.request.get(url)).status(), 404)
}
