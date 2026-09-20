/** Exercise website creation guidance through the shipped Sites panel without mutations. */
import assert from 'node:assert/strict'
import { join } from 'node:path'

/** Verify actionable creation choices and narrow layouts without creating or publishing.
 * @param page - Authenticated browser displaying Sites.
 * @param evidence - Test-owned screenshot directory.
 */
export async function verifySiteCreation(page, evidence) {
  const guide = page.getByRole('region', { name: '网站创建指南', exact: true })
  const mutations = []
  const observe = request => { if (request.url().includes('/api/enterprise/sites') && request.method() !== 'GET') mutations.push(request.url()) }
  page.on('request', observe)
  try {
    await guide.waitFor()
    assert.equal(await guide.getByRole('listitem').count(), 3)
    const create = page.getByRole('button', { name: '对话建站', exact: true })
    assert.equal(await create.isDisabled(), true)
    await page.getByLabel('描述你想创建的网站', { exact: true }).fill('A company website for international buyers')
    assert.equal(await create.isEnabled(), true)
    await page.getByLabel('描述你想创建的网站', { exact: true }).fill('')
    assert.equal(await page.getByRole('button', { name: '读取并检查企业资料', exact: true }).isVisible(), true)
    assert.equal(await page.getByRole('button', { name: '从制造业模板开始', exact: true }).isVisible(), true)
    await guide.screenshot({ path: join(evidence, 'sites-creation-guide-desktop.png') })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).waitFor()
    await guide.screenshot({ path: join(evidence, 'sites-creation-guide-mobile.png') })
    assert.equal(await guide.evaluate(node => node.scrollWidth <= node.clientWidth), true)
    assert.equal(await page.locator('.site-welcome').evaluate(node => node.scrollWidth <= node.clientWidth), true)
    assert.deepEqual(mutations, [])
  } catch (error) {
    await page.screenshot({ path: join(evidence, 'sites-creation-guide-failure.png') })
    throw new Error(`${error.message}\nSites guide: ${await guide.count()}\nVisible headings: ${await page.getByRole('heading').allTextContents()}`, { cause: error })
  } finally {
    page.off('request', observe)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
}
