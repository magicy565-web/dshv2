# Agent Note: Local enterprise workspace ownership

Status: implemented

English | [中文](2026-09-14-local-enterprise-workspace.zh.md)

## Problem

Enterprise profiles and reusable media need durable ownership independent of agent Sessions.

## Decision

The [enterprise plugin](../../../../trade/enterprise/README.md) contributes native sidebar and main slots and authenticated Connection routes. SQLite owns one profile and asset metadata; private UUID-addressed files publish only after streamed writes and content validation. Deletion clears matching logo references transactionally. The [foundation decision](../process/2026-09-14-trade-workspace-foundation.md) remains active for upstream composition and local deployment; this note owns enterprise persistence.

## Alternatives considered

**Separate GEO application or fixed onboarding forms.** Onboarding belongs to the existing chat. A bundled skill owns the question sequence while SQLite owns dynamic company and product drafts. The entry button invokes the native skill loader; the chat question service obtains confirmation for an exact stored revision. This preserves user review without making industry fields part of the application schema.

**Use chat attachments as the enterprise library.** Attachment receipts belong to agent requests. Uploading enterprise material must not add it to model context.

**Add accounts and object storage immediately.** One local enterprise has no membership or sharing requirement. Extra services do not remove the need for profile and asset ownership rules.

## Consequences

Structured product claims and referenced offers share the draft owner. A separate human fact-verification receipt enables only authenticated, non-indexable HTML and JSON-LD previews of the same values. Ordinary onboarding confirmation cannot issue this receipt; source, conflict and expiry checks run again before every preview. Treating internal confirmation as public readiness would expose unverified commercial claims and misrepresent an authenticated route as crawlable. Public deployment and discovery therefore remain explicitly incomplete.

This is one enterprise, not tenant isolation. Accounts require authorization on every record and file route. SQLite versions fail loudly when unsupported; startup reclaims interrupted and unowned files. Locked media can delay physical deletion until restart. Real Connection composition tests cover persistence, validation, ranges and upload teardown. Browser tests use a real dsh profile with isolated data. Native skill-invocation tests verify instruction loading. The onboarding skill and tools change model input without changing Session format; full real-model and recorded-session onboarding coverage remains absent.
