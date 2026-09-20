# Agent Note: Local enterprise workspace ownership

Status: implemented

English | [中文](2026-09-14-local-enterprise-workspace.zh.md)

## Problem

Enterprise profiles and reusable media need durable ownership independent of agent Sessions.

## Decision

The [enterprise plugin](../../../../trade/enterprise/README.md) contributes native sidebar and main slots and authenticated Connection routes. SQLite owns one profile and asset metadata; private UUID-addressed files publish only after streamed writes and content validation. Deletion clears matching logo references transactionally. The [foundation decision](../process/2026-09-14-trade-workspace-foundation.md) remains active for upstream composition and local deployment; this note owns enterprise persistence.

The company GEO revision also owns its Supplier Commerce Profile graph. Human confirmation covers objects, relationships, claim qualifications and evidence references together. Document references address immutable uploaded file ids and indexed ordinals; retrieval reports deleted evidence as missing. Product references retain catalog ownership. External procurement reads require a separate Bearer key, exact confirmed-revision grants and independent document grants. Confirming a replacement never inherits its predecessor's external grant.

## Alternatives considered

**Separate GEO application or fixed onboarding forms.** Onboarding belongs to the existing chat. A bundled skill owns the question sequence while SQLite owns dynamic company and product drafts. The entry button invokes the native skill loader; the chat question service obtains confirmation for an exact stored revision. This preserves user review without making industry fields part of the application schema.

**Use chat attachments as the enterprise library.** Attachment receipts belong to agent requests. Uploading enterprise material must not add it to model context.

**Publish every confirmed record or reuse browser credentials for external Agents.** Internal review does not authorize disclosure of confidential cases or documents. Exact-revision and file grants separate external access from internal confirmation. Workspace edits revoke grants immediately; deployment grants are only the initial value. A shared key supports this local deployment, while individual buyer identities require a separate authorization design.

**Add accounts and object storage immediately.** One local enterprise has no membership or sharing requirement. Extra services do not remove the need for profile and asset ownership rules.

## Consequences

Structured product claims and referenced offers share the draft owner. A separate human fact-verification receipt enables only authenticated, non-indexable HTML and JSON-LD previews of the same values. Ordinary onboarding confirmation cannot issue this receipt; source, conflict and expiry checks run again before every preview. Treating internal confirmation as public readiness would expose unverified commercial claims and misrepresent an authenticated route as crawlable. Public deployment and discovery therefore remain explicitly incomplete.

This is one enterprise, not tenant isolation. Accounts require authorization on every record and file route. SQLite versions fail loudly when unsupported; startup reclaims interrupted and unowned files. Locked media can delay physical deletion until restart. Real Connection composition tests cover persistence, validation, ranges and upload teardown. Browser tests use a real dsh profile with isolated data. Native skill-invocation tests verify instruction loading. The onboarding skill and tools change model input without changing Session format; full real-model and recorded-session onboarding coverage remains absent.

Supplier matching compares each object independently, using a separate human source-check receipt and current unconditional evidence. Unknown, inferred, conflicted, expired or qualified claims cannot promise an exact match; social and media observations alone cannot establish specifications. Procurement requests bind to a confirmed revision, use idempotent creation and optimistic status changes, and never authorize email or payment. Browser forms and chat tools share these owners instead of maintaining competing graphs.

Built-plugin tests cover graph validation, document citations, stale reviews, source deletion, external revocation and procurement persistence. Real `dsh` browser and HTTP tests cover editing, source review, matching, inbox transitions and shared media access. The authored keyless supplier-document snapshot checks missing-source output, request schemas and prompt persistence through the headless profile. Live-model end-to-end procurement conversations remain outside this verification.
