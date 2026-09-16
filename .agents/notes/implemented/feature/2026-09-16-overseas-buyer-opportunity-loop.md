# Agent Note: Overseas buyer research produces durable opportunities

Status: implemented

English | [中文](2026-09-16-overseas-buyer-opportunity-loop.zh.md)

## Decision

Overseas buyer research is a bundled Skill in the enterprise deployment. The Skill defines target clarification, source selection, procurement-signal checks, fit scoring, uncertainty handling, deduplication, and follow-up presentation. It does not own persistence, authorization, input validation, or external communication.

The same plugin also bundles focused methods for company and product onboarding, supplier evaluation, product profitability, brand positioning, and inquiry response. These Skills share enterprise records and tools; they do not introduce capability plugins of their own.

The enterprise plugin owns buyer opportunities as revisioned SQLite records. One record retains buyer identity, target product, fit rationale, procurement signals, cited web evidence, stage, contact facts, and next action. `enterprise_opportunity_list` reads existing records before research; `enterprise_opportunity_save` creates and revises them with optimistic concurrency. Qualified and later stages require at least one HTTP(S) evidence item.

The Opportunity board projects these records for search, filtering, evidence review, stage changes, and reversible archival. Starting research opens the bundled Skill in a conversation; later conversations resume from the same stored record. Outreach, private-contact verification, and purchase claims remain outside this closed loop.

The authenticated Connection service accepts exact paths only. The enterprise Site editor therefore stays on `/api/enterprise/sites` and maps validated `siteId` and `action` query values into its internal resource route instead of registering unsupported placeholder paths.
