---
description: "Structured site revisions and publication contracts for AI-built Shopify sites."
kind: "package-reference"
---

# @deepseek-ai/dsh-site

English | [中文](README.zh.md)

## Summary

This package owns tenant-scoped site records, revisions, typed change sets and publication jobs. The Agent produces `SiteChangeSet`; `validateSiteChangeSet` rejects invalid data before a provider translates it to Shopify resources.

## Publication lifecycle

The memory provider queues jobs separately from execution. Duplicate queued or running requests for the same revision reuse the job; a site permits only one running publication. Queued jobs can be cancelled. Execution requires a configured publisher and records success only after it completes. Failure preserves the previous `publishedRevisionId`; edits made during publication retain their separate `currentRevisionId`.

Revision inputs and returned records are detached from stored state. Rollback creates a new revision without overwriting history. Revision and publication history use newest-insertion-first ordering, including records created in the same millisecond.

Partial edits record their current draft as the base. `content` resolves inherited pages, theme and product order; explicit empty arrays clear a collection. `diff` compares resolved content for page additions, removals, edits and ordering changes. `preview` renders a selected stored page without publishing it. Rollback stores the target's complete content and stops inheritance from the draft it replaces. These reads reject revisions owned by another tenant or site.

## Editor HTTP

The authenticated editor adapter returns 404 for unknown routes and missing pages, 405 for unsupported methods, and 400 for missing preview parameters or invalid change sets. Route and method checks precede action parameter and body parsing. Preview page lookup uses resolved revision content, including inherited pages; an explicit empty page list removes them from that revision. Responses are private and use `no-store`.

`POST /sites/:id/publish` queues an existing revision and returns `202`; an optional `expectedRevisionId` rejects stale editor state with `409`. Queueing does not execute the provider, so publication workers retain ownership of retries and external side effects.

## Snapshot files

Explicit `save` writes a private temporary file, synchronizes it, and renames it over the destination. The parent directory must exist. `load` checks record fields, duplicate IDs, revision references and site ownership before replacing live state. Restore refuses while a publication is active; restored running jobs become failed and require provider reconciliation before retry. Queued jobs remain queued. Snapshots contain all tenants held by the service and belong only in administrator-controlled storage.

## Automatic SQLite persistence

The `./sqlite` entry exports `SqliteSiteStateStore`; pass it as the third constructor argument of `InMemorySiteService` from `./memory`. Every mutation commits before it becomes observable. Startup restores stored state and marks interrupted running jobs failed. Failed commits restore the prior in-memory state; a failed running-state commit prevents the publisher call. SQLite uses monotonic `user_version` and rejects unsupported versions. Generation checks reject stale writers rather than overwriting a different connection's state. Stop the service's work before closing the database.

## Known Limitations and Deferred Work

- File snapshot saves are explicit; the optional SQLite adapter provides automatic commits. It stores the complete service snapshot per transaction and is intended for one active service per database, not distributed publication. Session events and UI projections remain unimplemented.
- `createShopifySitePublisher` supplies the controlled adapter for an OAuth Shopify provider; callers must provide the selected theme id and an approved renderer.
- The first validator deliberately supports only controlled template fields; arbitrary Liquid and JavaScript are not accepted.

## Model Experience

The package provides the typed data accepted by a future site editing tool. It does not register a model-facing tool.

#### KV Cache effect

None.
