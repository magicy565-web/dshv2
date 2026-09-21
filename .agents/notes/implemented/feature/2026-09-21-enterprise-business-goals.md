# Agent Note: Enterprise business goals and task outcomes

Status: implemented

English | [中文](2026-09-21-enterprise-business-goals.zh.md)

## Problem

Enterprise tasks record work without identifying the business objective or the observed result. A Harness Session goal belongs to one conversation and cannot own the success criteria of an enterprise objective that spans independent work. Task completion counts alone do not establish business success.

## Decision

The existing [enterprise plugin](../../../../trade/enterprise/README.md#business-goals-and-task-outcomes) owns business goals beside company tasks. A goal contains a title, success criteria, an owner label, an optional deadline, active/paused/achieved status and a written outcome. Users confirm achievement; no task transition or model tool does so. Revisions reject stale mutations, reversible archival preserves references, and every goal change appends its complete record to enterprise audit in the same transaction.

Tasks optionally reference a business goal and retain a reported outcome in their revision history. New links require an active, unarchived goal. Existing links remain usable when a goal stops accepting new work. A linked task requires a nonempty outcome before completion. Successful human acceptance of computer work copies its submitted result to the task. The [computer acceptance decision](../architecture/2026-09-20-enterprise-computer-acceptance.md) continues to own execution uncertainty, required artifacts and approval checks.

The read-only `enterprise_work` tool returns paginated stored goals or tasks. Planning opens an ordinary new conversation with the selected goal id; model-visible records enter the Session through logged tool results. It neither creates a Session goal nor grants execution authority. The [workspace presentation decision](2026-09-21-trade-workspace-product-design.md) continues to own navigation and the rule against invented business metrics.

Enterprise SQLite generation 15 adds goals and explicitly assigns null goal references and empty outcomes to existing task records and history. It preserves their status and revision. Schema, stored task data and history migrate atomically; no inferred objective or historical result is manufactured.

## Alternatives considered

**Store company objectives in Harness Goal.** Its authority and continuation lifecycle belong to one Session. Business success criteria and human decisions remain valid across many conversations and independent tasks.

**Require a goal for every task.** Maintenance and direct user requests have value without a growth objective. Optional attribution avoids fabricating a goal to satisfy a required field.

**Introduce department agents, a goal-planning plugin chain and durable workflow infrastructure together.** The first observable requirement is a saved objective, attributed work and reviewable results. Existing enterprise storage, task editing and computer acceptance cover that requirement without another runtime or deployment service.

## Consequences

The local enterprise can trace tasks to explicit objectives and retain actual outcomes. Owner labels and the shared login do not establish authenticated organizational roles. This feature does not enforce monetary budgets, schedule unattended work, attribute incremental profit or verify the truth of a written outcome. Live external execution retains its existing verification requirements.

## Verification

Storage tests exercise HTTP validation, missing and inactive goal references, stale edits, pagination, audit, restart and generation-14 upgrades. UI tests require an outcome before completion and preserve independent tasks. The native browser scenario covers goal creation, linked work, explicit achievement and responsive layouts. The authored `enterprise-work-empty` Session covers the read-only tool and an empty business-goal result; it does not establish live model planning quality.
