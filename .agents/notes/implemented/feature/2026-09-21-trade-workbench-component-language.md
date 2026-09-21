# Agent Note: Trade workbench component language

Status: implemented

English | [中文](2026-09-21-trade-workbench-component-language.zh.md)

## Problem

The goal-first Home redesign (see [Trade home leads with the active goal](2026-09-21-trade-home-goal-first.md)) established a page language — one ink mission panel, open ledger rows, a decision queue, an outcome rail — but it existed only as inline JSX inside `client-overview.tsx`. Every additional workspace view would re-derive the same structures by hand, and small drifts (a missing pill slot, a different row grid) would quietly fragment the language.

## Decision

Extract the language into `trade/enterprise/src/workbench-ui.tsx`, a presentational component module that owns the `wb-*` structure while pages keep copy and data:

- **Hero family** — `Hero` (the screen's single filled surface, `data-status` toned), `HeroMain`, `HeroMeta`, `HeroTitle`, `HeroLede`, `HeroFacts`, `HeroCount` (the tabular-numeral anchor), `Meter`, and `HeroBanner` for the missing-object case.
- **Ledger family** — `Section` (baseline head with note and count pill, `complementary` renders the rail as an aside), `RowList`, `Row` (leading slot, title, status pill, relative time, meta line; the whole row activates).
- **Atoms** — `Eyebrow`, `Chip`, `ActorMark` (monogram tile with optional pulse ring; mark derivation lives here), `Dot`, `TextLink`.
- **Outcomes and empties** — `Timeline`/`TimelineEvent`, `EmptyHero`, `BlockEmpty`, `Quiet`.
- **Status and priority** — `StatusIcon` (Linear-style glyphs: dashed backlog, hollow todo, pie-filled in-progress, checked done, barred blocked, crossed canceled) and `PriorityBars` (three ascending bars, urgent mark at level 4).
- **Time** — `Countdown` (distance-appropriate granularity: days beyond 48h, hours+minutes within two days, minutes+seconds within the hour; optional per-second tick) and `Elapsed` (live work timer with pulse dot). `formatRemaining`/`formatElapsed` are exported pure functions.
- **Progress** — `ProgressBar` (thin track, accent/success/warn tones), `ProgressRing` (SVG ring with optional center value), `Steps` (segmented units).
- **Controls and feedback** — `Switch` (press-stretch knob), `Segmented`, `IconButton`, `TextField`, `Menu`/`MenuItem`/`MenuDivider`, `Tooltip` (CSS-only bubble), `Badge` (tinted labels), `Avatar`/`AvatarStack` (name-derived gradient), `Kbd`, `Skeleton` (shimmer).
- **Buttons and bulk actions** — `Button` (primary/secondary/ghost/danger, two sizes, loading state), `ButtonGroup`, `SplitButton`, `CopyButton` (transient done feedback), `ActionBar` (dark floating selection bar).
- **Forms** — `TextArea`, `SearchInput` (icon, shortcut cap, clear), `NumberInput` (steppers), `Select`, `Checkbox`, `RadioGroup`, `Slider` (tabular readout), `TagInput`, `FieldRow` (horizontal label column), `AddonField` (prefix/suffix), `DateField`, `Fieldset`.
- **Navigation** — `Tabs` (underline with counts), `Breadcrumb`, `Pagination`, `Stepper` (numbered nodes), `NavItem`/`NavSection` (sidebar).
- **Feedback** — `Alert` (info/success/warn/error), `Toast`, `Spinner`, `ThinkingDots`, `ResultState` (icon + title + hint + actions), `NotificationItem` (unread marker).
- **Data display** — `DataTable` (hairline, numeric columns), `DescriptionList`, `Stat`/`StatRow` (metric + `Delta`), `Sparkline` (`sparklinePoints` pure helper), `MiniBars`, `Donut`, `Tag`, `Code`/`CodeBlock`, `FileRow`, `MoneyText` (`formatMoney` pure helper), `Divider`, `Surface` (the single bordered card primitive), `Disclosure`.
- **Overlays** — `Dialog`, `Popover`, `CommandPalette` (search field, grouped commands, key-hint footer), `HoverCard`.
- **AI-native** — `PromptInput` (composer with send), `StreamingText` (blinking caret), `CitationChip` (numbered source), `AgentRun` (live run row with status glyph and elapsed timer).
- **Layout and business** — `PageHeader`, `Toolbar`, `FilterChip`, `Stack`, `SplitView`, `Grid`, `EmptySlot` (dashed dropzone), `KbdCombo`, `MatchScore` (threshold-toned ring), `PipelineSteps` (chevron stage flow), `QuotaMeter` (warns near limit), `ContactCard`.

Interaction states are part of the language: a shared `--workbench-ring` focus-visible ring, hover tints with a sliding arrow on rows, `scale(.995)` press feedback, and transitions on `--workbench-ease`; reduced-motion disables them via the existing media query. The module now ships 107 components; the profile icon set grew the control glyphs (x, check, plus, copy, filter, calendar, file, mail, more, send, alert, info, chevronLeft/Right, download) they need.

Components are locale-free: all text arrives through props, so `verify-client-ui-i18n` enforcement stays at the page layer. `client-overview.tsx` composes these exclusively; its rendered DOM is unchanged, so behavior tests and snapshots were unaffected.

## Alternatives considered

- **Keep per-page JSX** — rejected: the language would diverge with every new view, and the redesign's consistency would be unenforceable.
- **Adopt an external UI kit** — rejected: the design tokens (`--dsw-*`) and the Harness primitives already cover generic controls; a kit would fight the token layer instead of expressing the product language.
- **Promote the module into `dsh-client-ui-primitives`** — rejected: the mission panel, ledger rows and outcome rail are Trade's product identity, not Harness SDK vocabulary; the primitives package stays product-neutral.

## Consequences

- New workspace views compose the same primitives and inherit the visual hierarchy rules (one hero surface, hairline ledgers) structurally rather than by convention.
- The component module is dependency-free beyond React, so evidence tooling can server-render it directly (the gallery harness bundles it with esbuild and screenshots both themes).
- Future language changes (e.g. a new row slot or a hero variant) land in one module with JSDoc contracts instead of across page markup.

## Testing

The eight `workbench.spec.ts` behavior tests pass against the unchanged rendered DOM; `workbench-ui.spec.ts` covers the countdown/elapsed granularity rules, `sparklinePoints` padding/flat-series behavior, and `formatMoney` locales; `tsc -p trade/enterprise/tsconfig.client.json` passes; the gallery harness server-renders the module and screenshots both themes across 21 sections, including CDP-forced hover/focus/active interaction states.
