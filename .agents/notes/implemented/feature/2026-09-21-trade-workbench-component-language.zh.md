# Agent Note: Trade 工作台组件语言

Status: implemented

[English](2026-09-21-trade-workbench-component-language.md) | 中文

## Problem

目标优先的 Home 改版（见 [Trade 首页以当前目标为先](2026-09-21-trade-home-goal-first.zh.md)）确立了一套页面语言——一块墨色使命面板、开放台账行、决策队列、成果时间线——但它只以内联 JSX 的形式存在于 `client-overview.tsx` 里。每新增一个工作区视图都要手工复刻同样的结构，而细微的走样（少一个状态槽、行网格不一致）会悄悄瓦解这套语言。

## Decision

把这套语言抽取为 `trade/enterprise/src/workbench-ui.tsx`：一个纯展示组件模块，拥有 `wb-*` 结构，页面保留文案与数据：

- **Hero 家族**——`Hero`（一屏唯一的填充面板，`data-status` 控制色调）、`HeroMain`、`HeroMeta`、`HeroTitle`、`HeroLede`、`HeroFacts`、`HeroCount`（等宽数字锚点）、`Meter`，以及缺对象时的 `HeroBanner`。
- **台账家族**——`Section`（基线对齐的区头，含备注与计数徽章，`complementary` 时渲染为 aside 边栏）、`RowList`、`Row`（前导槽、标题、状态片、相对时间、元信息行；整行可激活）。
- **原子件**——`Eyebrow`、`Chip`、`ActorMark`（姓名缩写方块，可选脉冲环；缩写推导逻辑收在这里）、`Dot`、`TextLink`。
- **成果与空态**——`Timeline`/`TimelineEvent`、`EmptyHero`、`BlockEmpty`、`Quiet`。
- **状态与优先级**——`StatusIcon`（Linear 式图形：虚线待评估、空心待办、扇形填充进行中、对勾完成、横杠受阻、叉号取消）与 `PriorityBars`（三级递升柱，4 级为紧急标记）。
- **计时**——`Countdown`（按距离取粒度：48 小时外为天、两天内为时分、一小时内为分秒；可选逐秒跳动）与 `Elapsed`（实时工作计时，带脉冲点）。`formatRemaining`/`formatElapsed` 为导出的纯函数。
- **进度**——`ProgressBar`（细轨，accent/success/warn 三色调）、`ProgressRing`（SVG 环，可选中心数值）、`Steps`（分段单位）。
- **控件与反馈**——`Switch`（按下拉伸旋钮）、`Segmented`、`IconButton`、`TextField`、`Menu`/`MenuItem`/`MenuDivider`、`Tooltip`（纯 CSS 气泡）、`Badge`（淡色徽标）、`Avatar`/`AvatarStack`（按名字生成渐变）、`Kbd`、`Skeleton`（微光）。
- **按钮与批量动作**——`Button`（primary/secondary/ghost/danger，两种尺寸，加载态）、`ButtonGroup`、`SplitButton`、`CopyButton`（短暂完成反馈）、`ActionBar`（深色浮动选择栏）。
- **表单**——`TextArea`、`SearchInput`（图标、快捷键帽、清除钮）、`NumberInput`（步进器）、`Select`、`Checkbox`、`RadioGroup`、`Slider`（等宽读数）、`TagInput`、`FieldRow`（横向标签列）、`AddonField`（前后缀）、`DateField`、`Fieldset`。
- **导航**——`Tabs`（下划线含计数）、`Breadcrumb`、`Pagination`、`Stepper`（编号节点）、`NavItem`/`NavSection`（侧栏）。
- **反馈**——`Alert`（info/success/warn/error）、`Toast`、`Spinner`、`ThinkingDots`、`ResultState`（图标 + 标题 + 提示 + 动作）、`NotificationItem`（未读标记）。
- **数据展示**——`DataTable`（发丝线、数值列右对齐）、`DescriptionList`、`Stat`/`StatRow`（指标 + `Delta`）、`Sparkline`（`sparklinePoints` 纯函数）、`MiniBars`、`Donut`、`Tag`、`Code`/`CodeBlock`、`FileRow`、`MoneyText`（`formatMoney` 纯函数）、`Divider`、`Surface`（唯一的有边框卡片原语）、`Disclosure`。
- **浮层**——`Dialog`、`Popover`、`CommandPalette`（搜索框、命令分组、快捷键页脚）、`HoverCard`。
- **AI 原生**——`PromptInput`（带发送的输入器）、`StreamingText`（闪烁光标）、`CitationChip`（编号来源）、`AgentRun`（实时运行行：状态图形 + 计时）。
- **布局与业务**——`PageHeader`、`Toolbar`、`FilterChip`、`Stack`、`SplitView`、`Grid`、`EmptySlot`（虚线放置区）、`KbdCombo`、`MatchScore`（按阈值着色的环）、`PipelineSteps`（箭头阶段流）、`QuotaMeter`（接近上限转警示色）、`ContactCard`。

交互状态是语言的一部分：统一的 `--workbench-ring` 键盘聚焦环、行悬停底色加滑出箭头、`scale(.995)` 按下反馈、基于 `--workbench-ease` 的过渡；减少动态偏好经既有媒体查询关闭。模块现共 107 个组件；档案图标集补齐了控件所需的字形（x、check、plus、copy、filter、calendar、file、mail、more、send、alert、info、chevronLeft/Right、download）。

组件不带语言环境：所有文案经 props 传入，`verify-client-ui-i18n` 的约束留在页面层。`client-overview.tsx` 完全改用这些组件组合；渲染出的 DOM 不变，因此行为测试与快照不受影响。

## Alternatives considered

- **保留逐页 JSX**——否决：每加一个视图语言就走样一分，改版的一致性无从保证。
- **引入外部 UI 套件**——否决：设计令牌（`--dsw-*`）与 Harness 基础件已覆盖通用控件；外部套件只会与令牌层冲突，而非表达产品语言。
- **把模块上提到 `dsh-client-ui-primitives`**——否决：使命面板、台账行与成果轨是 Trade 的产品身份，不是 Harness SDK 的词汇；基础件包保持产品中立。

## Consequences

- 新的工作区视图组合同一套原语，从结构上（而非约定上）继承视觉层级规则（一块主角面板、发丝线台账）。
- 组件模块除 React 外无依赖，证据工具可直接服务端渲染（画廊脚本用 esbuild 打包后按明暗两主题截图）。
- 未来的语言演进（新增行槽位、Hero 变体）落在单个模块与 JSDoc 契约里，而不是散落在各页标记中。

## Testing

`workbench.spec.ts` 的八项行为测试在 DOM 不变的前提下全部通过；`workbench-ui.spec.ts` 覆盖计时粒度规则、`sparklinePoints` 的内边距与平坦序列行为、`formatMoney` 的语言环境；`tsc -p trade/enterprise/tsconfig.client.json` 通过；画廊脚本对组件模块做了明暗两主题、21 个展区的真实渲染截图，并用 CDP 强制伪类捕获悬停/聚焦/按下交互状态。
