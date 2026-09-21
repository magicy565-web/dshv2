# Agent Note: Trade home is a goal brief with a workstream, decision queue and outcome rail

Status: implemented

English | [中文](2026-09-21-trade-home-goal-first.zh.md)

## Problem

The enterprise workspace home was a metrics wall: four record-count cards, three action cards, a task list and a knowledge card, all at equal visual weight inside bordered boxes. It answered "what is stored" but not the questions a business owner opens the workspace with — what are we trying to achieve, what is in motion right now, and where am I needed. The empty state was a zeroed dashboard, completed work was invisible, and the page read as a back-office console rather than an AI-native operating workspace.

## Decision

`trade/enterprise/src/client-overview.tsx` renders the home as typography-led regions derived entirely from the existing snapshot; no backend data or API changed.

1. **Goal brief** — the current business goal (the active goal with the nearest deadline, otherwise the most recently updated goal) is the page's single visual center, carried on the screen's one filled surface: an ink-toned mission panel holding the eyebrow, status chip, display-size title, success criteria, factual context (linked-task counts via the existing `businessGoalTaskCount` copy, deadline, a time-elapsed meter) and a large tabular days-to-deadline numeral. No achievement percentage is derived from task counts; the goal editor already establishes that the owner confirms achievement. The first-run prompt and the no-goal banner reuse the same panel, so the page always has exactly one hero.
2. **Workstream** — in-progress tasks and pipeline opportunities (researching, qualified, contacted, negotiating) render as ledger rows with actor monogram tiles (a pulsing ring while in progress), status pills, relative dates and goal linkage. Rows navigate to the owning tab.
3. **Decision queue** — blocked tasks, draft GEO records awaiting confirmation (marked as AI-drafted when the agent created them), files whose text extraction failed, and new leads carry amber markers with a count in the section header.
4. **Outcome rail** — completed tasks with their recorded outcome, won opportunities and confirmed records sit on a vertical timeline, newest first.

A workspace with no goal, nothing in motion, nothing pending and no outcomes renders one centered prompt to create the first goal, with a secondary link to organize company sources. A workspace with data but no goal shows a compact goal banner instead. Sections with nothing to say stay quiet: the outcome rail hides until the first outcome exists.

Presentation lives in `workbench-style.ts` — one filled hero surface per screen, hairline dividers and open sections everywhere else, a hover-revealed directional arrow on rows, and `prefers-reduced-motion` disabling motion. The hero derives its surface and text colors from the theme's ink and canvas tokens, so dark mode inverts it without hardcoded colors. Copy lives in `workbench-locales.ts` with Chinese/English key parity.

## Alternatives considered

- **Restyle the metrics wall** — rejected: counts of stored records answer no business question, and equal-weight cards are the card soup the product direction forbids.
- **Derive goal progress from linked task completion** — rejected: the business-goal model deliberately separates task activity from goal achievement (`businessGoalTaskCount` is context and the owner records the outcome), so a computed percentage would misrepresent that separation.
- **Chat-first home** — rejected: the assistant is one tab away; the home's job is orientation — goal, motion, decisions, outcomes — and a chat box would re-center the page on prompting rather than operating.

## Consequences

The home answers the three orientation questions from data the workspace already has, the empty state is a single action instead of a zeroed dashboard, and every row drills into the owning view. What it gives up: at-a-glance totals for records, assets, opportunities and tasks no longer appear on home; they remain on their owning tabs. `workbench.spec.ts` and the `workbench-empty` baselines were rewritten to describe the new behavior, and visual evidence (desktop, mobile, first-run) was captured by seeding the real server through the enterprise API.

## Testing

`trade/enterprise/test/workbench.spec.ts` covers the goal brief in active and paused states, workstream inclusion rules, the four decision-queue item kinds, the outcome rail, row-to-tab navigation, and the bilingual first-run snapshot.
