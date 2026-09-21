# Agent Note: Enterprise folder onboarding and product ownership

Status: implemented

English | [中文](2026-09-21-enterprise-folder-onboarding.zh.md)

## Problem

Keyword search cannot establish whether an enterprise folder has been covered. A file upload and a product record also represent different user work: preserving a catalog does not create its products, and a presentation card does not own product revisions.

## Decision

The [enterprise plugin](../../../../trade/enterprise/README.md) stores an import inventory before transferring browser-selected files. Relative labels preserve source grouping without granting filesystem access. Each upload publishes file metadata, extracted chunks and its inventory receipt in one SQLite transaction. Repeating a completed upload returns that receipt. Partial batches retain successes and allow explicit reselection of the original folder to resume. The character limit produces a truncation flag instead of a claim of complete coverage.

The browser retains a failed selection and its import identity until success or a new selection. A retry reuses the persisted inventory rather than creating a second batch, including when the creation response is lost. A fresh inventory resolves lost upload responses because a network error does not prove that storage failed. File selection remains browser-local; reload still requires explicit reselection. Summary counts distinguish upload status, passage delivery and requests for user input.

The existing onboarding conversation uses a source tool to list inventories, read bounded pages and persist assessments. Only delivered passages count as read. Used documents require every extracted passage and cannot be truncated. Unknown media, failed extraction and conflicts retain explicit gaps. Final human scope confirmation includes exclusions and rejects changes made while the user reviews it. Source imports and deletion invalidate completion.

Explicit local OCR runs inside a disposable worker so cancellation and timeout can terminate rendering and recognition together. A complete result appends passages after native text, preserving existing citation ordinals, and records original page numbers. The immutable recognition receipt binds human review to the displayed text. The Agent can read unreviewed text to prepare drafts but cannot mark that source used. Adding OCR passages clears prior reading and assessment receipts and invalidates completed onboarding.

The product center edits existing GEO records and associates private asset IDs. It creates revision drafts for confirmed records, compares expected revisions and preserves content history. Archive and restore affect the revision family; active publication prevents archival. Descriptive sections remain dynamic and structured claims retain their existing Agent editing path. Confirmation grants no verification or publication authority.

Exact indexed citations link their source files to drafts and appear in the draft receipt; ambiguous labels require explicit file IDs. Internal records retain known facts in sourced sections when structured publication identity is unavailable. Optional unknown URLs are omitted, and malformed URLs produce field-specific validation errors. Progress indicators require source reading or explicit exclusion and review of the current records or confirmed scope; an upload or one confirmed company does not complete these milestones.

The [enterprise ownership decision](../architecture/2026-09-14-local-enterprise-workspace.md) and [workspace navigation decision](2026-09-21-trade-workspace-product-design.md) remain active: they own storage and native composition. This decision adds folder coverage and product maintenance, without replacing those owners.

## Alternatives considered

**Upload everything and search only for keywords.** Search can omit relevant documents and cannot distinguish unread files from absent business facts. A durable inventory and explicit dispositions make gaps reviewable.

**Give onboarding arbitrary filesystem access.** A browser-selected folder supplies the requested material without letting document instructions invoke filesystem operations or bypass human confirmation.

**Replace native text or automatically approve OCR.** Replacing text could change existing citations. Automatic approval would hide recognition errors behind completed source coverage. Appended passages and a separate human receipt preserve provenance and keep uncertainty visible.

**Create a separate product database for the UI.** This would split product identity, review and sources from the records the Agent already uses. Shared GEO ownership keeps manual edits and conversation changes consistent.

## Consequences

Folder ingestion and product maintenance work before or independently of model inference. Documents remain private and are read only through explicit tools. Reading receipts prove passage delivery, not model understanding. Local OCR appends page-labelled passages without replacing native text or original files. Human review is required before marking OCR sources used. Visual interpretation and archive extraction remain unavailable; unreadable files need text or an explicit scope exclusion. Browser uploads require reselecting local files after reload because the browser does not retain filesystem permission.

Host tests cover read coverage, restart persistence, source limits, missing sources, product revisions and confirmation. OCR tests cover cancellation, timeout, limits, Chinese/English image recognition, two-page PDF provenance and rejection of unreviewed sources; engine tests use locally supplied language data. A real dsh Web test covers folder selection, OCR review and product management on desktop and mobile. Keyless Session replay covers empty-source reporting, onboarding instructions and persisted document associations, including unreviewed OCR page citations. The opt-in live-model browser case imports synthetic company and two-product documents, checks extracted facts and unknowns, provides three fixture-owned record reviews plus final scope confirmation, and checks persistence after reload. It does not establish extraction accuracy for arbitrary catalogs or conflict resolution across large folders.
