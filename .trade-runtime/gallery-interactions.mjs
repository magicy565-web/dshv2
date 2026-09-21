import { chromium } from '../apps/web/node_modules/playwright/index.mjs'

const forced = [
  ['[data-state="hover-row"] .wb-row', ['hover']],
  ['[data-state="focus-btn"] button', ['focus-visible']],
  ['[data-state="active-switch"] .wb-switch', ['active']],
  ['[data-state="hover-menu"] .wb-menu-item', ['hover']],
  ['[data-state="focus-input"] input', ['focus']],
]

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 6800 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await page.goto(`file:///Z:/dshv2-main/.trade-runtime/gallery/gallery-${theme}.html`)
    await page.waitForTimeout(400)
    const session = await context.newCDPSession(page)
    await session.send('DOM.enable')
    await session.send('CSS.enable')
    const { root } = await session.send('DOM.getDocument')
    for (const [selector, pseudos] of forced) {
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector })
      if (nodeId) await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudos })
    }
    const top = await page.getByText('08 · 交互状态 Interaction States', { exact: true }).evaluate(el => el.getBoundingClientRect().top + window.scrollY)
    const bottom = await page.getByText('09 · 状态与优先级 Status & Priority', { exact: true }).evaluate(el => el.getBoundingClientRect().top + window.scrollY)
    await page.screenshot({ path: `Z:/dshv2-main/.trade-runtime/gallery/g8-interactions-${theme}.png`, fullPage: true, clip: { x: 0, y: top - 8, width: 1440, height: bottom - top - 4 } })
    await page.hover('[data-state="tooltip-demo"] .wb-icon-button')
    await page.waitForTimeout(800)
    const tipTop = await page.getByText('13 · 菜单 · 提示 · 徽标 · 头像 · 加载', { exact: true }).evaluate(el => el.getBoundingClientRect().top + window.scrollY)
    const tipBottom = await page.getByText('14 · 按钮与动作 Buttons & Actions', { exact: true }).evaluate(el => el.getBoundingClientRect().top + window.scrollY)
    await page.screenshot({ path: `Z:/dshv2-main/.trade-runtime/gallery/g13-feedback-${theme}.png`, clip: { x: 0, y: tipTop - 8, width: 1440, height: tipBottom - tipTop - 4 } })
    await context.close()
  }
  console.log('INTERACTIONS DONE')
} finally {
  await browser.close()
}
