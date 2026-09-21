---
description: "Persistent website source projects, revision review and publication jobs with optional Shopify commerce."
kind: "package-reference"
---

# @deepseek-ai/dsh-site

English | [中文](README.zh.md)

## Summary

Create tenant-owned websites without a commerce connection, save source projects and assets, compare revisions, and restore historical content. `SiteChangeSet` accepts structured pages or a complete project tree. Shopify adapters require an authorized store only when publishing to Shopify.

## Source projects

Projects record their framework (`static` or `nextjs`) and source files with UTF-8 text or canonical base64 bytes. Revisions retain complete file trees; an omitted project inherits its predecessor. Revision comparisons include added, removed and changed paths. Rollback restores the complete selected tree. Paths reject traversal, portable filesystem collisions, file-as-directory conflicts, credential filenames and repository metadata before storage.

`build` produces deterministic static artifacts tied to the exact revision. It requires `index.html`, preserves binary resources and never runs project code on the Host. Next.js projects can be stored but require a separate isolated framework build provider. Private previews use a sandbox without editor DOM or cookie access, disable network requests from scripts, and return `no-store` and `noindex`. Preview compilation resolves only saved project files, not Host files or installed Host packages.

Static preview compilation preserves stylesheet media conditions, deferred script execution, responsive image candidates and local SVG fragments. Missing local assets fail compilation. Files in the Host working directory cannot replace or prevent resolution of saved entries. Embedded page links ask the authenticated editor to load another path within the selected site revision; the sandbox retains its opaque origin. Standalone builds use ordinary page links.

## Template providers

`SiteTemplateService` registers installed `SiteTemplateProvider` implementations under exact id/version pairs. A provider supplies its input JSON Schema, `resolve` validates input and supplies defaults, and `render` produces portable source. Register providers inside an owning `ctx.effect`, returning the registration disposer. Duplicate versions fail. The [manufacturing provider](../../../trade/enterprise/src/site-template-provider.ts) is a working consumer-independent implementation; the enterprise editor and tools share the registry. Provider code is trusted installation code, not executable content accepted from a website request.

`generate` adds `site.template.json` containing the exact version, resolved parameters and a digest of the other source files. `inspect` reads this receipt without the provider installed. `regenerate` requires unchanged source and the recorded provider version; manual source changes or an unavailable version reject the operation. The receipt is editable provenance, not a signature or public-content approval. New templates do not change existing saved projects. Preserve source editing for customized projects or generate a separate site; automatic merging and version migration are not provided.

Consumers enforce their complete request-byte limit before saving. `createSiteWithProject` atomically stores the site and initial source revision; persistence failure leaves neither record. Later regeneration uses ordinary version-checked revisions, preview, export and rollback. The registry contains one authoritative provider map and has no independent invariant companion; source divergence is checked when regeneration is requested.

## Publication lifecycle

The memory provider queues jobs separately from execution. Duplicate queued or running requests for the same revision and destination reuse the job; a site permits only one running publication. Queued jobs can be cancelled. Execution requires a configured publisher and records success only after it completes. Failure preserves the previous `publishedRevisionId`; edits made during publication retain their separate `currentRevisionId`.

Revision inputs and returned records are detached from stored state. Rollback creates a new revision without overwriting history. Revision and publication history use newest-insertion-first ordering, including records created in the same millisecond.

Every edit after the first revision must name the current draft as its base; a missing or outdated base rejects the write. `content` resolves inherited pages, theme, product order and source files; explicit empty arrays clear a collection. `diff` compares resolved content. `preview` renders a selected stored page without publishing it. Rollback stores the target's complete content and stops inheritance from the draft it replaces. These reads reject revisions owned by another tenant or site.

## Management and activity

`manage` checks an optimistic metadata version before renaming, archiving or restoring a site. Archived sites retain readable revisions and reject edits and publication. Archive requires no pending publication; deletion additionally requires an archived site without a recorded successful publication. Enterprise hosting adds offline and in-flight-operation checks. A durable deletion receipt allows separate local stores to finish cleanup after restart.

Each source transaction also commits a `site/state` outbox record containing metadata, revision summaries and publication jobs. `./session` validates these records and exports the replayable `site` projection. The enterprise journal flushes records to a dedicated Session before acknowledging them; a repeated delivery does not duplicate the recorded sequence. Events contain no source bodies and never enter model history. Local and cloud deployment details retain their own stores and panels.

## Editor HTTP

The authenticated editor adapter returns 404 for unknown routes and missing pages, 405 for unsupported methods, and 400 for missing preview parameters or invalid change sets. Route and method checks precede action parameter and body parsing. Preview page lookup uses resolved revision content, including inherited pages; an explicit empty page list removes them from that revision. Responses are private and use `no-store`.

`POST /sites/:id/publish` queues an existing revision and returns `202`; an optional `expectedRevisionId` rejects stale editor state with `409`. Queueing does not execute the provider, so publication workers retain ownership of retries and external side effects.

## Snapshot files

Explicit `save` writes a private temporary file, synchronizes it, and renames it over the destination. The parent directory must exist. `load` checks record fields, duplicate IDs, revision references and site ownership before replacing live state. Restore refuses while a publication is active; restored running jobs become failed and require provider reconciliation before retry. Queued jobs remain queued. Snapshots contain all tenants held by the service and belong only in administrator-controlled storage.

## Automatic SQLite persistence

The `./sqlite` entry exports `SqliteSiteStateStore`; pass it as the third constructor argument of `InMemorySiteService` from `./memory`. Every mutation commits before it becomes observable. Startup restores stored state and marks interrupted running jobs failed. Failed commits restore the prior in-memory state; a failed running-state commit prevents the publisher call. SQLite uses monotonic `user_version` and rejects unsupported versions. Generation checks reject stale writers rather than overwriting a different connection's state. Stop the service's work before closing the database.

## Known Limitations and Deferred Work

- File snapshot saves are explicit; the optional SQLite adapter provides automatic commits. It stores the complete service snapshot per transaction and is intended for one active service per database, not distributed publication.
- `createShopifySitePublisher` supplies the controlled adapter for an OAuth Shopify provider; callers must provide the selected theme id and an approved renderer.
- JavaScript is accepted as project source and runs only in the visitor browser. Next.js execution, independent hosting, deployment settings and domain management require additional providers. The structured page renderer remains a controlled template.

## Model Experience

The package supplies typed editing and publication operations. It does not register model-facing tools; the [enterprise Sites consumer](../../../trade/enterprise/README.md#sites-workspace) owns their registration.

#### KV Cache effect

None.
