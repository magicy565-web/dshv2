import { chromium } from '../apps/web/node_modules/playwright/index.mjs'

const groups = [
  ['01 · 使命面板 Hero', 'g1-hero'],
  ['02 · 使命面板 · 已暂停 / 无目标横幅', 'g2-hero-states'],
  ['03 · 首次进入 EmptyHero', 'g3-empty'],
  ['04 · 工作流 Ledger + 决策队列 Queue', 'g4-ledger-queue'],
  ['05 · 成果时间线 Timeline', 'g5-timeline'],
  ['06 · 原子件 Atoms', 'g6-atoms'],
  ['07 · 字体层级 Type Scale', 'g7-type'],
  ['08 · 交互状态 Interaction States', 'g8-interactions'],
  ['09 · 状态与优先级 Status & Priority', 'g9-status'],
  ['10 · 计时 Timers', 'g10-timers'],
  ['11 · 进度 Progress', 'g11-progress'],
  ['12 · 控件 Controls', 'g12-controls'],
  ['13 · 菜单 · 提示 · 徽标 · 头像 · 加载', 'g13-feedback'],
  ['14 · 按钮与动作 Buttons & Actions', 'g14-buttons'],
  ['15 · 表单 Forms', 'g15-forms'],
  ['16 · 导航 Navigation', 'g16-nav'],
  ['17 · 反馈 Feedback', 'g17-feedback'],
  ['18 · 数据展示 Data Display', 'g18-data'],
  ['19 · 浮层 Overlays', 'g19-overlays'],
  ['20 · AI 原生 AI-Native', 'g20-ai'],
  ['21 · 布局与业务 Layout & Business', 'g21-layout'],
]

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await page.goto(`file:///Z:/dshv2-main/.trade-runtime/gallery/gallery-${theme}.html`)
    await page.waitForTimeout(400)
    if (theme === 'light') await page.hover('.wb-row')
    const tops = []
    for (const [text] of groups) {
      const top = await page.getByText(text, { exact: true }).evaluate(el => el.getBoundingClientRect().top + window.scrollY)
      tops.push(top)
    }
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
    for (let i = 0; i < groups.length; i++) {
      const top = Math.max(0, tops[i] - 8)
      const bottom = i + 1 < groups.length ? tops[i + 1] - 12 : pageHeight
      await page.screenshot({ path: `Z:/dshv2-main/.trade-runtime/gallery/${groups[i][1]}-${theme}.png`, fullPage: true, clip: { x: 0, y: top, width: 1440, height: bottom - top } })
    }
    await context.close()
  }
  console.log('SECTIONS DONE')
} finally {
  await browser.close()
}
