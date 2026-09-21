/** One-off gallery: renders the workbench component language to static HTML with real tokens and screenshots both themes. */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from '../apps/web/node_modules/playwright/index.mjs'

const ui = await import('./gallery-ui.cjs')
const { workbenchStyle } = await import('../trade/enterprise/src/workbench-style.ts')
const { createElement: h, renderToStaticMarkup, Hero, HeroMain, HeroMeta, HeroTitle, HeroLede, HeroFacts, HeroCount, Meter, Chip, Eyebrow, Section, RowList, Row, ActorMark, Dot, TextLink, Timeline, TimelineEvent, EmptyHero, HeroBanner, Countdown, Elapsed, ProgressBar, ProgressRing, Steps, StatusIcon, PriorityBars, Badge, Avatar, AvatarStack, Kbd, Tooltip, Switch, Segmented, IconButton, Menu, MenuItem, MenuDivider, Skeleton, TextField, Button, ButtonGroup, SplitButton, CopyButton, ActionBar, TextArea, SearchInput, NumberInput, Select, Checkbox, RadioGroup, Slider, TagInput, FieldRow, AddonField, DateField, Fieldset, Tabs, Breadcrumb, Pagination, Stepper, NavItem, NavSection, Alert, Toast, Spinner, ThinkingDots, ResultState, NotificationItem, DataTable, DescriptionList, Stat, StatRow, Sparkline, MiniBars, Donut, Tag, Code, CodeBlock, FileRow, MoneyText, Divider, Surface, Disclosure, Dialog, Popover, CommandPalette, HoverCard, PromptInput, StreamingText, CitationChip, AgentRun, PageHeader, Toolbar, FilterChip, Stack, SplitView, Grid, EmptySlot, KbdCombo, MatchScore, PipelineSteps, QuotaMeter, ContactCard } = ui as any

const noop = () => undefined
const base = Date.parse('2026-09-21T14:00:00Z')
const formatMoneyInline = (amount: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(amount)
const zh = { day: '天', hour: '小时', minute: '分钟', second: '秒' }
const label = (text: string) => h('div', { style: { font: '600 11px/1.5 var(--dsw-font-family)', letterSpacing: '.1em', color: 'var(--workbench-muted)', margin: '40px 0 14px' } }, text)
const cell = (caption: string, child: React.ReactNode, state?: string) => h('div', { key: caption, 'data-state': state, style: { display: 'grid', gap: 8, alignContent: 'start' } },
  h('span', { style: { fontSize: 10.5, color: 'var(--workbench-muted)' } }, caption), child)
const primary = (text: string) => h('button', { type: 'button', style: { background: 'var(--workbench-action)', color: 'var(--workbench-action-ink)', border: 0, borderRadius: 8, padding: '9px 16px', font: '600 13px/1 var(--dsw-font-family)', cursor: 'pointer' } }, text)
const grid = (key: string, children: React.ReactNode[]) => h('div', { key, style: { display: 'flex', alignItems: 'flex-start', gap: 26, flexWrap: 'wrap', padding: '6px 0' } }, children)

const page = [
  h('div', { key: 'brand', style: { marginBottom: 8 } },
    h('div', { style: { font: '650 26px/1.3 var(--dsw-font-family)', letterSpacing: '-.02em' } }, 'Trade 组件语言'),
    h('p', { style: { color: 'var(--workbench-muted)', fontSize: 13, margin: '8px 0 0' } }, '一屏一个主角 · 开放台账 · 决策队列 · 成果时间线 —— workbench-ui.tsx')),

  label('01 · 使命面板 Hero'),
  h(Hero, { key: 'hero', status: 'active', label: '当前业务目标' },
    h(HeroMain, null,
      h(HeroMeta, null, h(Eyebrow, null, '当前业务目标'), h(Chip, { status: 'active' }, '推进中'), h(TextLink, { onActivate: noop, end: true }, '查看目标')),
      h(HeroTitle, null, '把印花人棉打入美国市场'),
      h(HeroLede, null, '90 天内获得 10 位合格买家，并产生至少 3 次样品请求。'),
      h(HeroFacts, null, h('span', null, '1 / 2 个任务已完成 · 0 个受阻'), h('span', null, '截止 2026-12-15')),
      h(Meter, { percent: 38, label: '时间进度' })),
    h(HeroCount, { value: 85, caption: '天后截止' })),

  label('02 · 使命面板 · 已暂停 / 无目标横幅'),
  h(Hero, { key: 'hero-paused', status: 'paused', label: '当前业务目标' },
    h(HeroMain, null,
      h(HeroMeta, null, h(Eyebrow, null, '当前业务目标'), h(Chip, { status: 'paused' }, '已暂停'), h(TextLink, { onActivate: noop, end: true }, '查看目标')),
      h(HeroTitle, null, '拓展中东家纺渠道'),
      h(HeroLede, null, '暂停期间保留全部上下文，恢复后继续推进。'),
      h(HeroFacts, null, h('span', null, '0 / 3 个任务已完成 · 1 个受阻'), h('span', null, '未设期限')))),
  h('div', { key: 'banner-gap', style: { height: 16 } }),
  h(Hero, { key: 'hero-none', status: 'none', label: '当前业务目标' },
    h(HeroBanner, { eyebrow: '开始', title: '设定你的第一个业务目标' }, primary('创建目标'))),

  label('03 · 首次进入 EmptyHero'),
  h(EmptyHero, { key: 'empty', eyebrow: '开始', title: '设定你的第一个业务目标', hint: '目标是工作区的最高上下文：任务、买家研究和 AI 工作都围绕它推进。' },
    primary('创建目标'), h(TextLink, { onActivate: noop }, '先整理企业资料')),

  label('04 · 工作流 Ledger + 决策队列 Queue'),
  h('div', { key: 'main', className: 'wb-main' },
    h(Section, { label: '正在推进', title: '正在推进', note: '任务与买家机会的最新进展' },
      h(RowList, null,
        h(Row, { leading: h(ActorMark, { label: 'US Market Agent', pulse: true }), title: '调研美国窗帘与面料分销商', pill: '进行中', time: '今天', meta: '任务 · US Market Agent · 关联目标 把印花人棉打入美国市场', onActivate: noop }),
        h(Row, { leading: h(ActorMark, { label: 'BHN International' }), title: 'BHN International Textile Inc.', pill: '洽谈中', time: '今天', meta: '机会 · 美国 · Printed Rayon Challis 印花人棉 · 下一步：核对 MOQ 与印花工艺匹配度', onActivate: noop }),
        h(Row, { leading: h(ActorMark, { label: 'Azure Home', pulse: true }), title: 'Azure Home Textiles', pill: '研究中', time: '昨天', meta: '机会 · 美国 · 印花人棉 · 下一步：核查采购信号', onActivate: noop }))),
    h(Section, { complementary: true, label: '需要你的处理', title: '需要你的处理', count: 4, countTone: 'warn' as const },
      h(RowList, null,
        h(Row, { leading: h(Dot, { tone: 'warn' }), title: '确认样品国际运费与时效', time: '今天', meta: '任务受阻', onActivate: noop }),
        h(Row, { leading: h(Dot, { tone: 'warn' }), title: '印花人棉产品档案', time: '今天', meta: '档案待确认 · AI 整理', onActivate: noop }),
        h(Row, { leading: h(Dot, { tone: 'warn' }), title: 'notes.txt', time: '昨天', meta: '文字提取失败', onActivate: noop }),
        h(Row, { leading: h(Dot, { tone: 'warn' }), title: 'H&M Trading', time: '昨天', meta: '新线索待跟进', onActivate: noop })))),

  label('05 · 成果时间线 Timeline'),
  h(Section, { key: 'results', className: 'wb-results', label: '最近成果', title: '最近成果' },
    h(Timeline, null,
      h(TimelineEvent, { time: '今天', kind: '机会成交', title: 'Azure Home Textiles', detail: 'Printed Rayon Challis 印花人棉', onActivate: noop }),
      h(TimelineEvent, { time: '今天', kind: '任务完成', title: '整理 Printed Rayon Challis 产品资料', detail: '产品规格、成分与高清图片已归档。', onActivate: noop }),
      h(TimelineEvent, { time: '9/19', kind: '档案确认', title: '绍兴纺织企业档案', detail: '企业档案', onActivate: noop }))),

  label('06 · 原子件 Atoms'),
  grid('atoms', [
    h(Chip, { status: 'active' }, '推进中'), h(Chip, { status: 'paused' }, '已暂停'), h(Chip, { status: 'achieved' }, '已达成'),
    h('span', { className: 'wb-pill' }, '洽谈中'),
    h(Dot, { tone: 'work' }), h(Dot, { tone: 'warn' }), h(Dot, { tone: 'done' }), h(Dot, { tone: 'muted' }),
    h(ActorMark, { label: 'US Market Agent', pulse: true }), h(ActorMark, { label: 'BHN International' }), h(ActorMark, { label: '绍兴纺织' }), h(ActorMark, { label: '' }),
    h(TextLink, { onActivate: noop }, '查看目标'),
  ]),

  label('07 · 字体层级 Type Scale'),
  h('div', { key: 'type', style: { display: 'grid', gap: 14, paddingBottom: 8 } },
    h('div', null, h('div', { style: { fontSize: 11, color: 'var(--workbench-muted)', marginBottom: 4 } }, 'Display · 38 / 650 / -.032em'), h('div', { style: { fontSize: 38, fontWeight: 650, letterSpacing: '-.032em' } }, '把印花人棉打入美国市场')),
    h('div', null, h('div', { style: { fontSize: 11, color: 'var(--workbench-muted)', marginBottom: 4 } }, 'Page Title · 23 / 600'), h('div', { style: { fontSize: 23, fontWeight: 600, letterSpacing: '-.025em' } }, '绍兴纺织')),
    h('div', null, h('div', { style: { fontSize: 11, color: 'var(--workbench-muted)', marginBottom: 4 } }, 'Section · 15 / 600'), h('div', { style: { fontSize: 15, fontWeight: 600 } }, '正在推进')),
    h('div', null, h('div', { style: { fontSize: 11, color: 'var(--workbench-muted)', marginBottom: 4 } }, 'Body · 13.5'), h('div', { style: { fontSize: 13.5 } }, '任务与买家机会的最新进展')),
    h('div', null, h('div', { style: { fontSize: 11, color: 'var(--workbench-muted)', marginBottom: 4 } }, 'Secondary · 12 / muted / tabular'), h('div', { style: { fontSize: 12, color: 'var(--workbench-muted)', fontVariantNumeric: 'tabular-nums' } }, '截止 2026-12-15 · 关联目标 把印花人棉打入美国市场')),
    h('div', null, h('div', { style: { fontSize: 11, color: 'var(--workbench-muted)', marginBottom: 4 } }, 'Numeric · 300 / tabular'), h('div', { style: { fontSize: 46, fontWeight: 300, letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums' } }, '85'))),

  label('08 · 交互状态 Interaction States'),
  grid('lab', [
    cell('默认 Default', h(RowList, null, h(Row, { leading: h(ActorMark, { label: 'US Market Agent' }), title: '调研美国窗帘与面料分销商', pill: '进行中', time: '今天', meta: '任务 · US Market Agent', onActivate: noop }))),
    cell('悬停 Hover', h(RowList, null, h(Row, { leading: h(ActorMark, { label: 'US Market Agent' }), title: '调研美国窗帘与面料分销商', pill: '进行中', time: '今天', meta: '任务 · US Market Agent', onActivate: noop })), 'hover-row'),
    cell('键盘聚焦 Focus', h(IconButton, { icon: 'settings', label: '设置', onActivate: noop }), 'focus-btn'),
    cell('按下 Active（开关拉伸）', h(Switch, { checked: true, onToggle: noop, label: '自动跟进' }), 'active-switch'),
    cell('菜单项悬停', h(Menu, { label: '操作' }, h(MenuItem, { icon: 'arrow', label: '查看详情', onActivate: noop })), 'hover-menu'),
    cell('输入聚焦', h(TextField, { label: '目标名称', value: '把印花人棉打入美国市场', onChange: noop }), 'focus-input'),
  ]),

  label('09 · 状态与优先级 Status & Priority'),
  grid('status', [
    cell('待评估', h(StatusIcon, { status: 'backlog' })), cell('待办', h(StatusIcon, { status: 'todo' })),
    cell('进行中 25%', h(StatusIcon, { status: 'inprogress', progress: 25 })), cell('进行中 50%', h(StatusIcon, { status: 'inprogress', progress: 50 })), cell('进行中 80%', h(StatusIcon, { status: 'inprogress', progress: 80 })),
    cell('已完成', h(StatusIcon, { status: 'done' })), cell('受阻', h(StatusIcon, { status: 'blocked' })), cell('已取消', h(StatusIcon, { status: 'canceled' })),
  ]),
  grid('priority', [
    cell('无', h(PriorityBars, { level: 0 })), cell('低', h(PriorityBars, { level: 1 })), cell('中', h(PriorityBars, { level: 2 })), cell('高', h(PriorityBars, { level: 3 })), cell('紧急', h(PriorityBars, { level: 4 })),
  ]),

  label('10 · 计时 Timers'),
  grid('timers', [
    cell('目标截止（天粒度）', h(Countdown, { to: new Date(base + 85 * 86400000).toISOString(), labels: zh, now: base })),
    cell('报价有效期（时分）', h(Countdown, { to: new Date(base + 3 * 3600000 + 12 * 60000).toISOString(), labels: zh, now: base })),
    cell('审批等待（分秒）', h(Countdown, { to: new Date(base + 9 * 60000 + 5000).toISOString(), labels: zh, now: base })),
    cell('AI 已工作（实时）', h(Elapsed, { since: new Date(base - 222000).toISOString(), now: base })),
  ]),

  label('11 · 进度 Progress'),
  h('div', { key: 'progress', style: { display: 'grid', gap: 22, maxWidth: 560 } },
    h(ProgressBar, { value: 38, label: '目标进度' }),
    h(ProgressBar, { value: 100, tone: 'success' as const, label: '资料归档' }),
    h(ProgressBar, { value: 62, tone: 'warn' as const, label: '本月外联配额' })),
  h('div', { key: 'rings', style: { display: 'flex', alignItems: 'center', gap: 26, marginTop: 22 } },
    cell('匹配度', h(ProgressRing, { value: 68, size: 44, showValue: true })),
    cell('紧凑', h(ProgressRing, { value: 40, size: 26 })),
    cell('任务步骤', h(Steps, { done: 2, total: 5, label: '2/5' }))),

  label('12 · 控件 Controls'),
  grid('controls', [
    cell('开关 开', h(Switch, { checked: true, onToggle: noop, label: '自动跟进' })),
    cell('开关 关', h(Switch, { checked: false, onToggle: noop, label: '自动归档' })),
    cell('分段选择', h(Segmented, { options: [{ value: 'all', label: '全部' }, { value: 'active', label: '进行中' }, { value: 'done', label: '已完成' }], value: 'active', onChange: noop, label: '任务筛选' })),
    cell('图标按钮', h('div', { style: { display: 'flex', gap: 6 } }, h(IconButton, { icon: 'search', label: '搜索', onActivate: noop }), h(IconButton, { icon: 'globe', label: '翻译', onActivate: noop }), h(IconButton, { icon: 'settings', label: '设置', onActivate: noop }))),
    cell('表单域', h(TextField, { label: '买家名称', value: '', placeholder: '例如 BHN International', hint: '来自机会看板的买家公司名。', onChange: noop })),
  ]),

  label('13 · 菜单 · 提示 · 徽标 · 头像 · 加载'),
  h('div', { key: 'feedback', style: { display: 'flex', alignItems: 'flex-start', gap: 34, flexWrap: 'wrap' } },
    h(Menu, { label: '行操作' },
      h(MenuItem, { icon: 'arrow', label: '打开详情', hint: '↵', onActivate: noop }),
      h(MenuItem, { icon: 'settings', label: '编辑目标', hint: '⌘E', onActivate: noop }),
      h(MenuItem, { icon: 'link', label: '复制链接', hint: '⌘C', onActivate: noop }),
      h(MenuDivider, null),
      h(MenuItem, { icon: 'case', label: '归档目标', danger: true, onActivate: noop })),
    h('div', { style: { display: 'grid', gap: 18 } },
      cell('悬浮提示', h(Tooltip, { tip: '由 AI 根据资料库整理' }, h(IconButton, { icon: 'sparkle', label: 'AI 整理', onActivate: noop })), 'tooltip-demo'),
      cell('键盘键帽', h('span', { style: { display: 'inline-flex', gap: 6, alignItems: 'center' } }, h(Kbd, null, '⌘'), h(Kbd, null, 'K'), h('span', { style: { fontSize: 11, color: 'var(--workbench-muted)' } }, '命令面板')))),
    h('div', { style: { display: 'grid', gap: 12 } },
      cell('徽标', h('span', { style: { display: 'inline-flex', gap: 8, flexWrap: 'wrap' } },
        h(Badge, { tone: 'blue', dot: true }, '进行中'), h(Badge, { tone: 'amber', dot: true }, '待确认'), h(Badge, { tone: 'green', dot: true }, '已完成'), h(Badge, { tone: 'red', dot: true }, '提取失败'), h(Badge, null, '草稿'))),
      cell('头像', h('span', { style: { display: 'inline-flex', gap: 10, alignItems: 'center' } },
        h(Avatar, { label: 'US Market Agent' }), h(Avatar, { label: '绍兴纺织' }), h(AvatarStack, { labels: ['US Market Agent', 'BHN International', 'Azure Home'] })))),
    cell('加载骨架', h('div', { style: { width: 220 } }, h(Skeleton, null))),
  ),

  label('14 · 按钮与动作 Buttons & Actions'),
  grid('buttons', [
    cell('色调', h('span', { style: { display: 'inline-flex', gap: 8 } }, h(Button, { onActivate: noop }, '创建目标'), h(Button, { tone: 'secondary', onActivate: noop }, '保存草稿'), h(Button, { tone: 'ghost', onActivate: noop }, '取消'), h(Button, { tone: 'danger', onActivate: noop }, '归档'))),
    cell('小尺寸 / 加载中', h('span', { style: { display: 'inline-flex', gap: 8 } }, h(Button, { size: 'sm', tone: 'secondary', onActivate: noop }, '查看'), h(Button, { loading: true, onActivate: noop }, '保存中'))),
    cell('按钮组', h(ButtonGroup, null, h(Button, { tone: 'secondary', size: 'sm', onActivate: noop }, '周'), h(Button, { tone: 'secondary', size: 'sm', onActivate: noop }, '月'), h(Button, { tone: 'secondary', size: 'sm', onActivate: noop }, '季'))),
    cell('分裂按钮', h(SplitButton, { label: '导出报价单', menuLabel: '更多导出', onActivate: noop, onMenu: noop })),
    cell('复制按钮', h(CopyButton, { text: 'INV-2026-0921', label: '复制单号', doneLabel: '已复制' })),
    cell('选择动作栏', h(ActionBar, { countLabel: '已选 3 项', clearLabel: '清除选择', onClear: noop }, h(Button, { tone: 'ghost', size: 'sm', onActivate: noop }, '批量归档'), h(Button, { tone: 'ghost', size: 'sm', onActivate: noop }, '指派'))),
  ]),

  label('15 · 表单 Forms'),
  h('div', { key: 'forms', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22, maxWidth: 1080 } },
    h(SearchInput, { value: '', placeholder: '搜索买家、任务、档案…', shortcut: '⌘K', clearLabel: '清除', onChange: noop, onClear: noop }),
    h(SearchInput, { value: 'BHN International', clearLabel: '清除', onChange: noop, onClear: noop }),
    h(TextArea, { label: '成功标准', value: '90 天内获得 10 位合格买家，并产生至少 3 次样品请求。', onChange: noop }),
    h(NumberInput, { label: '目标买家数', value: 10, min: 1, max: 100, onChange: noop }),
    h(Select, { label: '目标市场', options: [{ value: 'us', label: '美国' }, { value: 'de', label: '德国' }, { value: 'sa', label: '沙特' }], value: 'us', onChange: noop }),
    h('div', { style: { display: 'grid', gap: 10 } }, h(Checkbox, { checked: true, label: '完成后自动归档', onChange: noop }), h(Checkbox, { checked: false, label: '需要人工复核后才发送', hint: 'AI 起草的外联邮件先进入决策队列。', onChange: noop })),
    h(RadioGroup, { name: '跟进频率', options: [{ value: 'daily', label: '每天' }, { value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }], value: 'weekly', onChange: noop }),
    h(Slider, { label: '匹配度阈值', value: 65, min: 0, max: 100, onChange: noop }),
    h(TagInput, { label: '目标产品', tags: ['印花人棉', '窗帘面料'], value: '', placeholder: '回车添加…', removeLabel: '移除', onChange: noop, onRemove: noop }),
    h(AddonField, { label: '样品报价', prefix: 'USD', suffix: '/公斤', value: '4.20', onChange: noop }),
    h(DateField, { label: '截止日期', value: '2026-12-15', onChange: noop }),
    h(FieldRow, { label: '负责人', hint: '负责任务推进与结果确认。' }, h(Select, { options: [{ value: 'a', label: 'US Market Agent' }, { value: 'b', label: '王芳' }], value: 'a', onChange: noop })),
    h(Fieldset, { legend: '通知偏好' }, h(Checkbox, { checked: true, label: '新线索时通知', onChange: noop }), h(Checkbox, { checked: false, label: '每周摘要', onChange: noop })),
  ),

  label('16 · 导航 Navigation'),
  h('div', { key: 'nav', style: { display: 'grid', gap: 24 } },
    h(Tabs, { label: '任务视图', options: [{ value: 'all', label: '全部', count: 12 }, { value: 'active', label: '进行中', count: 3 }, { value: 'done', label: '已完成', count: 9 }], value: 'active', onChange: noop }),
    h('div', { style: { display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'center' } },
      h(Breadcrumb, { label: '位置', items: [{ label: '业务目标', onActivate: noop }, { label: '美国市场', onActivate: noop }, { label: '把印花人棉打入美国市场' }] }),
      h(Pagination, { page: 2, pages: 5, onChange: noop, label: '分页' })),
    h(Stepper, { label: '建站步骤', steps: ['企业档案', '产品资料', '页面生成', '发布上线'], current: 2 }),
    h('div', { style: { width: 230 } }, h(NavSection, { label: '工作区' },
      h(NavItem, { icon: 'overview', label: '工作台', active: true, onActivate: noop }),
      h(NavItem, { icon: 'case', label: '业务目标', count: 2, onActivate: noop }),
      h(NavItem, { icon: 'globe', label: '机会看板', count: 6, onActivate: noop }),
      h(NavItem, { icon: 'file', label: '企业资料', onActivate: noop }))),
  ),

  label('17 · 反馈 Feedback'),
  h('div', { key: 'feedback2', style: { display: 'grid', gap: 14, maxWidth: 720 } },
    h(Alert, { tone: 'info', title: 'AI 已整理 3 份档案', action: h(TextLink, { onActivate: noop }, '查看') }, '根据本周上传的资料，产品档案已更新。'),
    h(Alert, { tone: 'success' }, '报价单已发送给 BHN International。'),
    h(Alert, { tone: 'warn', title: '外联配额将用尽' }, '本月已使用 42/50 次，升级套餐可提高配额。'),
    h(Alert, { tone: 'error', title: '文字提取失败' }, 'notes.txt 不是受支持的格式，请转换为 PDF 后重试。')),
  grid('feedback-b', [
    cell('Toast', h(Toast, { tone: 'success', title: '档案已确认', message: '印花人棉产品档案已进入资料库。', onClose: noop })),
    cell('加载', h('span', { style: { display: 'inline-flex', gap: 18, alignItems: 'center' } }, h(Spinner, null), h(Spinner, { size: 22 }), h(ThinkingDots, null))),
    cell('通知', h('div', { style: { width: 340 } },
      h(NotificationItem, { actor: 'US Market Agent', title: '调研完成', body: '美国窗帘分销商清单已生成，共 24 家。', time: '2 分钟前', unread: true, onActivate: noop }),
      h(NotificationItem, { actor: '王芳', title: '提到你', body: '样品运费已确认，请复核报价。', time: '1 小时前', onActivate: noop }))),
  ]),
  h(Surface, { key: 'resultstate', padding: false }, h(ResultState, { icon: 'search', title: '没有匹配的买家', hint: '试试放宽国家或产品条件，或让 AI 扩大调研范围。' }, h(Button, { size: 'sm', onActivate: noop }, '让 AI 调研'), h(Button, { size: 'sm', tone: 'secondary', onActivate: noop }, '清除筛选'))),

  label('18 · 数据展示 Data Display'),
  h('div', { key: 'data1', style: { display: 'grid', gap: 26 } },
    h(Surface, { padding: false }, h(DataTable, { label: '买家报价', columns: [{ key: 'buyer', label: '买家' }, { key: 'product', label: '产品' }, { key: 'qty', label: '数量', align: 'right' }, { key: 'price', label: '单价', align: 'right' }, { key: 'status', label: '状态' }], rows: [
      { buyer: 'BHN International', product: '印花人棉', qty: '2,400 kg', price: h(MoneyText, { amount: 4.2, currency: 'USD', locale: 'en-US' }), status: h(Badge, { tone: 'blue', dot: true }, '洽谈中') },
      { buyer: 'Azure Home', product: '窗帘面料', qty: '1,100 kg', price: h(MoneyText, { amount: 3.85, currency: 'USD', locale: 'en-US' }), status: h(Badge, { tone: 'green', dot: true }, '已成交') },
      { buyer: 'H&M Trading', product: '印花人棉', qty: '—', price: h(MoneyText, { amount: 0, currency: 'USD', locale: 'en-US', tone: 'muted' }), status: h(Badge, null, '新线索') },
    ] })),
    h(Surface, null, h(StatRow, null,
      h(Stat, { label: '本月新买家', value: '12', delta: { up: true, text: '+20%' } }),
      h(Stat, { label: '样品请求', value: '5', delta: { up: true, text: '+2' } }),
      h(Stat, { label: '成交金额', value: formatMoneyInline(84200), delta: { up: false, text: '-8%' } }))),
    h('div', { style: { display: 'flex', gap: 34, flexWrap: 'wrap', alignItems: 'center' } },
      cell('趋势 Sparkline', h(Sparkline, { values: [4, 6, 5, 9, 8, 12, 11, 14], width: 120, height: 30 })),
      cell('柱状 MiniBars', h(MiniBars, { values: [3, 7, 4, 9, 6, 11, 8] })),
      cell('构成 Donut', h(Donut, { size: 52, centerLabel: '24', segments: [{ value: 14 }, { value: 7 }, { value: 3 }] })),
      cell('描述列表', h(DescriptionList, { items: [{ label: '法定代表人', value: '王芳' }, { label: '成立年份', value: '2008' }, { label: '主营', value: '印花人棉、窗帘面料' }] }))),
    h('div', { style: { display: 'grid', gap: 4, maxWidth: 560 } },
      h(FileRow, { name: '产品目录-2026.pdf', size: '4.2 MB', status: { tone: 'green', label: '已入库' }, onActivate: noop }),
      h(FileRow, { name: 'notes.txt', size: '12 KB', status: { tone: 'red', label: '提取失败' }, onActivate: noop })),
    h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
      h(Tag, { label: '印花人棉', onRemove: noop }), h(Tag, { label: '美国市场' }), h(Code, null, 'INV-2026-0921'), h(MoneyText, { amount: 12800, currency: 'CNY', locale: 'zh-CN' })),
    h(Divider, { label: '或者' }),
    h(CodeBlock, { language: 'JSON', code: '{\n  "buyer": "BHN International",\n  "matchScore": 86\n}', copyLabel: '复制', doneLabel: '已复制' }),
    h(Disclosure, { title: '查看调研依据（4 条证据）', defaultOpen: true }, 'AI 调研基于买家官网采购页、近 90 天进口记录与两条行业展会名录。'),
  ),

  label('19 · 浮层 Overlays'),
    h('div', { key: 'overlays', style: { display: 'flex', gap: 30, flexWrap: 'wrap', alignItems: 'flex-start' } },
    h('div', { style: { position: 'relative', display: 'grid', placeItems: 'center', minHeight: 260, borderRadius: 14, background: 'color-mix(in srgb, var(--workbench-ink) 32%, transparent)', padding: 26 } },
      h(Dialog, { title: '归档这个目标？', label: '归档目标', onClose: noop, actions: h(ButtonGroup, null, h(Button, { tone: 'secondary', size: 'sm', onActivate: noop }, '取消'), h(Button, { tone: 'danger', size: 'sm', onActivate: noop }, '归档')) }, '归档后目标及其任务转为只读，成果保留在时间线中。')),
    h('div', { style: { display: 'grid', gap: 20 } },
      h(CommandPalette, { query: '', placeholder: '输入命令或搜索…', onChange: noop, onPick: noop, items: [
        { icon: 'plus', label: '创建业务目标', hint: '⌘N' },
        { icon: 'globe', label: '调研美国买家', hint: '⌘R' },
        { icon: 'file', label: '上传企业资料', hint: '⌘U' },
        { icon: 'settings', label: '打开设置', hint: '⌘,' },
      ], footer: h('span', { style: { display: 'inline-flex', gap: 12 } }, h('span', null, '↑↓ 选择'), h('span', null, '↵ 执行'), h('span', null, 'Esc 关闭')) }),
      h('div', { style: { display: 'flex', gap: 20 } },
        h(Popover, { label: '筛选' }, h('div', { style: { display: 'grid', gap: 8 } }, h(Checkbox, { checked: true, label: '进行中', onChange: noop }), h(Checkbox, { checked: false, label: '已暂停', onChange: noop }))),
        h(HoverCard, { title: 'BHN International' }, '美国加州家纺分销商，年采购约 40 吨人棉面料。匹配度 86。'))),
  ),

  label('20 · AI 原生 AI-Native'),
  h('div', { key: 'ai', style: { display: 'grid', gap: 20, maxWidth: 640 } },
    h(PromptInput, { value: '', placeholder: '告诉 AI 下一步做什么…', hint: 'AI 会读取目标、资料库与机会看板', sendLabel: '发送', onChange: noop, onSend: noop }),
    h('div', null,
      h(StreamingText, { text: '已检索 24 家美国窗帘分销商，正在核对采购信号' }),
      h('div', { style: { display: 'flex', gap: 8, marginTop: 10 } }, h(CitationChip, { index: 1, label: '买家官网采购页', onActivate: noop }), h(CitationChip, { index: 2, label: '近 90 天进口记录', onActivate: noop }))),
    h(AgentRun, { actor: 'US Market Agent', title: '调研美国窗帘与面料分销商', status: 'inprogress', since: new Date(base - 222000).toISOString(), now: base, onActivate: noop }),
    h(AgentRun, { actor: 'Content Agent', title: '生成产品英文介绍页', status: 'done', since: new Date(base - 5400000).toISOString(), now: base, onActivate: noop }),
  ),

  label('21 · 布局与业务 Layout & Business'),
  h('div', { key: 'layout', style: { display: 'grid', gap: 26 } },
    h(Surface, { padding: false }, h('div', { style: { padding: '16px 18px' } }, h(PageHeader, {
      breadcrumb: h(Breadcrumb, { label: '位置', items: [{ label: '机会看板', onActivate: noop }, { label: 'BHN International' }] }),
      title: 'BHN International',
      description: '美国 · 家纺分销 · 匹配度 86',
      actions: h(ButtonGroup, null, h(Button, { tone: 'secondary', size: 'sm', onActivate: noop }, '备注'), h(Button, { size: 'sm', onActivate: noop }, '发送报价')),
    }))),
    h(Toolbar, null,
      h(SearchInput, { value: '', placeholder: '搜索机会…', clearLabel: '清除', onChange: noop, onClear: noop }),
      h(FilterChip, { label: '国家', value: '美国', onRemove: noop }),
      h(FilterChip, { label: '阶段', value: '洽谈中', onRemove: noop }),
      h(Button, { tone: 'ghost', size: 'sm', onActivate: noop }, '重置')),
    h('div', { style: { display: 'flex', gap: 34, flexWrap: 'wrap', alignItems: 'center' } },
      cell('匹配度 MatchScore', h('span', { style: { display: 'inline-flex', gap: 16 } }, h(MatchScore, { score: 86 }), h(MatchScore, { score: 54 }), h(MatchScore, { score: 28 }))),
      cell('配额 QuotaMeter', h('div', { style: { width: 220 } }, h(QuotaMeter, { used: 42, total: 50, label: '本月外联' }))),
      cell('快捷键 KbdCombo', h(KbdCombo, { keys: ['⌘', 'Shift', 'P'] }))),
    cell('销售管道 PipelineSteps', h(PipelineSteps, { stages: ['线索', '研究中', '已接触', '洽谈中', '成交'], current: 3 })),
    h(SplitView, { ratio: 2 },
      h('div', null, h('strong', { style: { fontSize: 13 } }, '主内容区'), h('p', { style: { fontSize: 12, color: 'var(--workbench-muted)' } }, 'SplitView 以发丝线分隔双栏。')),
      h('div', null, h('strong', { style: { fontSize: 13 } }, '侧栏'), h('p', { style: { fontSize: 12, color: 'var(--workbench-muted)' } }, '比例可调。'))),
    h(Grid, { min: 200 },
      h(ContactCard, { name: 'Sarah Bennett', role: '采购总监 · BHN', email: 'sarah@bhn.example', onActivate: noop }),
      h(ContactCard, { name: '王芳', role: '总经理', email: 'wangfang@shaoxing.example', onActivate: noop }),
      h(EmptySlot, { icon: 'plus', title: '添加联系人', hint: '从机会或手动创建' })),
  ),
]

const tokens = `:root{
--dsw-alias-label-primary:rgb(15,17,21);--dsw-alias-label-secondary:rgb(97,102,107);--dsw-alias-label-tertiary:rgb(129,133,140);
--dsw-alias-border-l2:rgba(0,0,0,.1);--dsw-alias-bg-layer-1:rgb(255,255,255);--dsw-alias-bg-base:rgb(255,255,255);
--dsw-specific-sidebar-fill:rgb(249,250,251);--dsw-alias-state-business-primary:rgb(65,118,230);
--dsw-static-deepseek-600:rgb(72,104,178);--dsw-static-neutral-00:rgb(255,255,255);
--dsw-alias-state-warn-primary:rgb(245,158,11);--dsw-alias-state-warn-label:rgb(221,134,41);
--dsw-alias-state-success-primary:rgb(34,197,94);--dsw-alias-interactive-bg-hover:rgba(0,0,0,.04);
--dsw-font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}
body[data-ds-dark-theme]{--dsw-alias-label-primary:rgb(249,250,251);--dsw-alias-label-secondary:rgb(207,211,214);--dsw-alias-label-tertiary:rgb(173,178,184);--dsw-alias-border-l2:rgba(255,255,255,.12);--dsw-alias-bg-layer-1:rgb(35,35,36);--dsw-alias-bg-base:rgb(21,21,23);--dsw-specific-sidebar-fill:rgb(27,27,28);--dsw-alias-state-business-primary:rgb(103,158,254);--dsw-alias-interactive-bg-hover:rgba(255,255,255,.06)}
body{margin:0}`

const markup = renderToStaticMarkup(h('div', { className: 'ent' }, h('div', { className: 'ent-inner', style: { margin: '0 auto' } }, page)))
const html = (dark: boolean) => `<!doctype html><html><head><meta charset="utf-8"><style>${tokens}</style><style>${workbenchStyle}</style></head><body data-trade-workbench${dark ? ' data-ds-dark-theme' : ''}>${markup}</body></html>`

const output = fileURLToPath(new URL('../.trade-runtime/gallery', import.meta.url))
await mkdir(output, { recursive: true })
await writeFile(join(output, 'gallery-light.html'), html(false))
await writeFile(join(output, 'gallery-dark.html'), html(true))

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  const page1 = await context.newPage()
  await page1.goto(`file:///${join(output, 'gallery-light.html').replace(/\\/g, '/')}`)
  await page1.hover('.wb-row')
  await page1.waitForTimeout(400)
  await page1.screenshot({ path: join(output, 'gallery-light.png'), fullPage: true })
  const page2 = await context.newPage()
  await page2.goto(`file:///${join(output, 'gallery-dark.html').replace(/\\/g, '/')}`)
  await page2.waitForTimeout(400)
  await page2.screenshot({ path: join(output, 'gallery-dark.png'), fullPage: true })
  console.log('GALLERY', output)
} finally {
  await browser.close()
}
