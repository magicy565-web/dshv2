# Enterprise workspace plugin

English | [中文](README.zh.md)

This private deployment plugin contributes **Enterprise workspace** to the native sidebar and main slots. It reuses Harness authentication, locale dictionaries, React primitives and the browser module loader. SQLite owns the local records; `file-type`, Zod and `range-parser` provide file detection, input validation and media ranges.

## User records

### Chat onboarding

Before a company profile exists, Enterprise workspace offers only **Start product GEO**. The button opens a new chat and sends the native `/product-geo` invocation, which loads the bundled [skill](skills/product-geo/SKILL.md). Its fixed sequence checks existing records, understands the business, gathers sources, refines drafts, and requests confirmation within chat. Questions and sections follow the user's business, not an industry form. Existing profiles retain a **Product GEO** entry.

The deployment's SQLite `enterprise_geo` table retains company and product drafts, sources, unresolved questions, revisions, and calling session ids. The chat review service obtains the human answer before confirmation; stale reviews cannot confirm edited content. Confirmation creates a basic company profile only when none exists. GEO sections remain private and do not feed the existing machine-readable projections. This local deployment is not a tenant-isolated service, and confirmation is neither commercial verification nor publication.

Built-plugin tests verify native skill loading, draft persistence, rejected and stale confirmations, and dynamic fields. Browser tests verify the single-button entry and chat navigation; they do not prove a complete real-model onboarding conversation or recorded-session replay.

**Continue onboarding** reopens the persisted conversation after a browser reload; an unavailable conversation is replaced and the skill reads saved progress. Confirmed records can receive a separate revision draft without losing their original content. Completion requires the user's in-chat confirmation of the exact records included in this task, not merely one saved product. Any draft change invalidates completion. Chat documents are read through session-owned attachment references and returned with chunk citations. Onboarding conversations enforce a knowledge-tool allowlist; shell, filesystem, and direct profile-write tools cannot bypass review.

The first visit creates one user-named company or studio. Its profile contains a logo, description, products/services, website and contact details. The asset tab supports multiple-file upload, category filtering, name search, image/video preview, download, rename and confirmed deletion. Logo selection uses an uploaded image. Removing that image also clears the profile logo. Supported documents enter a local text index; only requested passages enter model context through tools.

Supported uploads are JPEG, PNG, WebP, GIF, AVIF, MP4, WebM, QuickTime, PDF, DOCX, XLSX, PPTX, ZIP and UTF-8 TXT/CSV/Markdown. Binary formats are detected from content; a supplied MIME type cannot enable an unsupported format. Documents download as attachments. Video playback depends on the browser's codec support. Uploads run one at a time; a batch keeps earlier successful files if a later upload fails.

### Bundled business skills

One enterprise plugin registers the business methods; each Skill reuses the same records and tools instead of creating its own plugin:

- [Product GEO](skills/product-geo/SKILL.md) establishes company and product records through sourced chat review.
- [Overseas buyer research](skills/overseas-buyer-research/SKILL.md) finds and qualifies evidence-backed buyer opportunities.
- [Supplier evaluation](skills/supplier-evaluation/SKILL.md) compares dropshipping and private-label supply options and verification gaps.
- [Product profitability](skills/product-profitability/SKILL.md) models landed costs, fees, returns, scenarios, and test thresholds.
- [Brand positioning](skills/brand-positioning/SKILL.md) turns business facts into a focused positioning hypothesis and market test.
- [Inquiry response](skills/inquiry-response/SKILL.md) extracts buyer requirements and prepares a checked reply or quotation outline without sending it.

### Overseas buyer opportunities

The bundled [overseas buyer research skill](skills/overseas-buyer-research/SKILL.md) defines how the Agent establishes a target, finds candidates, checks current sources, scores fit consistently, and reports uncertainty. `enterprise_opportunity_list` prevents duplicate research; `enterprise_opportunity_save` validates and persists new or revised records. Skill instructions cannot bypass plugin validation or authorize outreach.

The **Opportunity board** shows saved buyers, target products, countries, match scores, evidence counts, stages, and next actions. Users can search, filter, inspect cited web evidence, change a stage, archive a record, or start a new research conversation. Records use optimistic revisions so stale Agent or browser updates cannot overwrite newer work. A `qualified` or later stage requires at least one HTTP(S) evidence item; contact and commercial facts may remain explicitly unknown.

SQLite `enterprise_opportunities` stores the complete record across conversations. The current closed loop ends at a saved follow-up opportunity. It does not send outreach, verify private contact data, or claim a purchasing relationship.

## Storage and configuration

### Supplier Commerce Profile and document queries

In the existing Product GEO conversation, ask the Agent to build a procurement profile from enterprise documents. Company drafts accept a structured `supplier` graph with offerings, solutions, capabilities, value propositions, cases, partner programs and commercial policies. Offering nodes can reference confirmed product records; the graph does not replace the product catalog. Claims preserve qualifications, evidence references, uncertainty and expiry. Evidence distinguishes documents, user statements, websites and social posts, with explicit supported claims and limitations. Agent input cannot assign `VERIFIED` status.

`enterprise_geo_draft` validates graph references and cited document chunks. `enterprise_geo_review` presents the complete graph for human confirmation. `enterprise_supplier_query` returns current confirmed graphs with optional `query`, `kind`, `recordId`, `nodeId` and `offset`; `maxKnowledgeResults` bounds each page. A replacement draft leaves its predecessor queryable until confirmation. `enterprise_search` returns document `fileId` and `chunk`; `enterprise_document_read` returns that exact passage, citation, content hash and upload time. Deleted evidence is marked missing. Tool output follows the existing Session logging path.

Enterprise workspace opens the procurement profile. **Edit procurement profile** maintains every object, claim, evidence item and relationship; **Build with Agent** extracts drafts through the existing conversation. Offering levels cover category, family, product and variant. Buyer types, markets, business models and confidentiality remain explicit. Evidence cards open original passages or uploaded media and retain category, confidence, excerpts and publication dates. Resolve open questions, save a draft, then review the complete revision before confirmation. Queries use literal keywords; the calling Agent interprets natural-language procurement requests. Scanned documents require extractable text; OCR is disabled.

**Check sources** and `enterprise_supplier_verify` record a separate human source-check receipt for the exact confirmed revision, not third-party certification. Inferred, conflicted, expired or missing sources block attestation. **Procurement match** and `enterprise_supplier_match` compare required and optional attributes independently for each candidate using equals, contains, minimum and maximum operators. MATCH requires current unconditional evidence for every required attribute and a source-check receipt; NO_MATCH identifies an established contradiction; POSSIBLE retains missing, qualified, expired or incomparable facts. Numeric comparisons require compatible explicit units. Social observations and media alone never establish exact specifications.

**Procurement requests** records quote, sample, specification, partnership and purchase-consultation requests. Workspace forms and `enterprise_procurement_prepare` save drafts; a human submits and follows them through submitted, in-review and closed states. External buyer API submissions enter the inbox directly. Requests bind to exact company revisions and selected objects, reject stale edits, persist across restarts and reuse their UUID for identical retries. These actions do not send email, create a paid order or make payment. SQLite owns disclosure revisions, source-check receipts, requests and audit records.

### External procurement Agent API

External reads use a separate Bearer credential and explicit deployment grants. With no `externalAgentToken`, no `/supplier/v1/` routes are registered. The deployment overlay reads `DSH_SUPPLIER_AGENT_TOKEN` (at least 32 characters), `DSH_SUPPLIER_RECORDS` (a JSON array of exact `{ "id": "<company-record-uuid>", "revision": 2 }` grants) and `DSH_SUPPLIER_DOCUMENTS` (a JSON array of uploaded file UUIDs). Obtain confirmed record ids and revisions from `enterprise_geo_status`, and file ids from `enterprise_search`. Setting a grant without a token fails configuration validation. Configure secrets outside committed files, then restart the `trade` profile. Remote deployment supplies HTTPS and network access controls.

**External Agent access** selects confirmed revisions and files; saving replaces grants immediately with an optimistic revision check. Deployment grants apply only until workspace grants are first saved. All endpoints require `Authorization: Bearer <token>`, independently of browser login. Read endpoints use GET; action endpoints use JSON POST bounded by `maxSupplierBodyBytes` (default 1 MiB). Responses use `Cache-Control: no-store`; routes are excluded from indexing.

| Route | Result |
| --- | --- |
| `/supplier/v1/manifest` | Version, authentication, read endpoints and action JSON input schemas. |
| `/supplier/v1/query?query=viscose&kind=capability` | Shared confirmed graph objects with claims and evidence; filters are optional. Use `recordId` and `offset` for a selected record's next page, or `nodeId` to follow a relationship. |
| `/supplier/v1/search?query=viscose` | Matching passages from explicitly shared documents only. |
| `/supplier/v1/document?fileId=<uuid>&chunk=1` | One shared passage with its citation and content hash. |
| `/supplier/v1/asset?id=<uuid>` | Shared original file, including byte ranges for media. |
| POST `/supplier/v1/match` | Per-object comparison against structured requirements. |
| POST `/supplier/v1/inquiries` | Idempotent inbox submission; returns only request id, revision and status. |

A file grant exposes the original bytes and all indexed passages. Unshared files cannot be searched or read; their evidence references return only an evidence id and `not_shared`, and cannot support an external MATCH. Company grants expose the complete reviewed graph and sections, including case and commercial claims. A confirmed replacement invalidates its predecessor's grant and requires a fresh source check and grant. Removing a grant or deleting a file takes effect immediately; key rotation requires restart. The key serves one local enterprise and one shared access scope, without per-buyer identities, OAuth, MCP transport or an anonymous supplier directory.

Built-plugin and matching tests cover revision review, source deletion, uncertainty, disclosure revocation, idempotent requests and inbox transitions. `test/supplier-browser.test.mjs` boots the shipped `dsh` Web profile and exercises editing, review, document reading, matching, requests and live sharing on desktop and mobile; evidence is saved under `.trade-runtime/supplier-evidence/`. The keyless [supplier document snapshot](../../snapshots/session/supplier-document-missing/snapshot.yml) replays a missing-source tool result and the Agent response through the headless profile, including prompt and tool-schema oracles. It uses authored model output; a live-model end-to-end conversation is not part of this verification.

### Structured GEO products

Product drafts accept an optional structured `product` with identity, direct answer, intended customers, typed claims, evidence, media, variants, solution links and offers. Claims own fact values; offers reference commercial claims and supply currency, ordering unit, region and expiry. Fabric GSM aliases normalize to `g/m²`, and width measurements normalize to centimeters. Unknown commercial values remain unknown. Free-text records remain readable but do not satisfy structured-product readiness.

`enterprise_geo_status` returns independent Entity, Understanding, Facts, Evidence and Discovery results with blocking reasons. The ordinary draft confirmation does not verify product facts. `enterprise_geo_verify` obtains a separate human source-check attestation for the exact confirmed revision; model input cannot set that receipt. Missing sources, public inferred/conflicted facts, invalid measurements and expired commercial claims block preview. Human attestation is not independent certification. Revisions require a fresh attestation.

Authenticated `GET /api/enterprise/products/readiness?id=<record-id>` returns the same readiness report. `GET /api/enterprise/products/preview?id=<record-id>` compiles HTML, and `&format=jsonld` selects matching JSON-LD. Public `/products/<slug>`, `/robots.txt` and `/sitemap.xml` routes are available when configured. Internal preview excludes private claims and evidence and uses `no-store` plus `noindex`; public routes include only currently valid published products. Discovery still lacks multilingual entity resolution, automatic monitoring and guaranteed search inclusion. Full real-model and recorded-session coverage of structured product onboarding remains absent.

The [deployment overlay](../cordis.patch.yml) supplies the absolute `directory`, `maxFileBytes` and `maxTotalBytes`. Its limits are 256 MiB per file and 2 GiB per enterprise. The default directory is `.trade-runtime/enterprise/`, with `enterprise.sqlite` and private UUID-named files under `files/`. Back up this entire directory while the server is stopped. SQLite `user_version` is monotonic; unsupported versions fail at startup.

Authenticated `/api/enterprise` routes expose the profile and metadata, while `/api/enterprise/file` serves validated asset ids with byte-range support. Display names never address disk paths. The database commits uploaded files only after their streamed write and type validation succeed. Startup removes interrupted writes and files without metadata. A deleted file locked by a media reader can remain on disk until the next startup.

Confirmed products can be synchronized with `enterprise_shopify_sync` when `shopDomain`, `accessToken` and `apiVersion` are supplied by deployment configuration. The sync stores Shopify product and variant ids, excludes price and inventory, and records failures for retry. Public products are served at `/products/<slug>` with matching HTML and JSON-LD; `/robots.txt` and `/sitemap.xml` list only successfully synchronized products.

`GET /api/enterprise/shopify/jobs` returns `{items,total,limit,offset,hasMore}`; each item includes the persisted `handle`, an `attemptsLog`, and `retryable` when a failed job remains within the configured attempt limit. It accepts `productId`, `connectionId`, `status`, `limit` and `offset` filters.

User-owned Shopify stores use `/api/enterprise/shopify/oauth/start` and `/api/enterprise/shopify/oauth/callback`. The callback validates state and HMAC, exchanges the code for an offline token, and stores the encrypted token with its tenant-local store connection. `POST /api/enterprise/shopify/webhooks` validates the raw-body HMAC, deduplicates `X-Shopify-Webhook-Id`, and marks an uninstalled store connection as revoked.

`enterprise_site_publish` and `enterprise_site_unpublish` control the Shopify-GEO public site independently from commerce synchronization. Site publication assigns a unique slug, content fingerprint, version, public URL and timestamps. Only products with `siteStatus: published` enter the public route and sitemap; a pending Shopify commerce connection does not block the site projection.

This is one enterprise per local deployment, with workspace access controlled by the existing browser login and external procurement reads controlled by the separate grants above. It does not implement multi-account membership, tenant isolation, anonymous document sharing or file conversion. The schema and Host own record consistency; the plugin has no separate invariant installer.

## Canonical Company Entity

The profile stores a Workbuddy Company Entity compatible projection rather than display text alone. The first submission assigns a stable `companyEntityId` (`cmp_...`); `identity`, `offerings`, `fit`, `capabilities`, `constraints` and `trust` are the authoritative facts. Legacy fields such as `name` and `business` remain as editor-compatible fields.

Facts may carry `status` (`VERIFIED`, `SELF_DECLARED`, `INFERRED`, `UNKNOWN`, `OUTDATED`, `CONFLICTED`), `visibility` (`PUBLIC`, `AGENT`, `WORKSPACE`, `RESTRICTED`), source, update time and validity. Public projections do not expose internal fields as public facts.

Machine-readable endpoints:

- `/api/enterprise/public`: public Company Entity projection.
- `/api/enterprise/agent`: public fields plus capabilities and constraints available to the Agent.

Both endpoints project the same SQLite enterprise record; they do not maintain a second JSON or webpage source. They do not replace the authenticated workspace API. Public hosting still configures cache policy, canonical URLs, robots and JSON-LD at the Web route.

## Sites workspace

The Sites sidebar opens the persisted website list without requiring a company profile or Shopify store. It offers conversation creation and editing, desktop/mobile private previews, a source-file editor, source export and historical draft restoration. `site_create`, `site_get`, `site_update_draft`, `site_preview` and `site_rollback` use the authenticated deployment identity; file edits reject an outdated observed revision. The Host stores source projects in `sites.sqlite` independently of the originating conversation. Source files must contain only approved public content.

Static previews bundle saved local scripts, module imports, styles and images inside a sandbox without editor DOM access. They do not execute project code in the enterprise Host. Saving source or opening a local preview does not publish a website.

For Next.js source, `site_preview` submits the selected revision to configured independent hosting and reports its deployment identity, digest and build status. Repeating the request inspects the same build without resubmitting or promoting it. Only a ready build returns a protected preview URL. Failed builds remain failed until the agent saves a corrected revision; uncertain submissions retain their recovery checkpoint. Preview inspection does not require DNS or production routing to be available.

Failed cloud builds retain an error summary and an optional build-log tail for the Sites panel and tool results (`error`, `buildLog`). The Vercel adapter reads [deployment events](https://vercel.com/docs/rest-api/deployments/get-deployment-events) only after checking deployment ownership, removes terminal escape sequences and masks its control-plane token. `siteHosting.maxBuildLogEvents` limits fetched events; `siteHosting.maxDiagnosticCharacters` limits the combined summary and log text. Logs may be incomplete. Unavailable logs do not erase a confirmed failure, and a later refresh retries log retrieval without resubmitting source.

The source editor imports selected local assets into a chosen project directory. Files remain unsaved until **Save new version**; replacing an existing portable path requires the replacement checkbox. The browser checks the complete encoded revision against the Host request limit, and the Host validates paths and file bytes before persistence. Source export downloads an ordinary ZIP containing the current editor files, including unsaved edits. Previews and cloud builds use the selected saved revision. Save or discard edits before switching sites, changing revisions, refreshing the list or starting another conversation from the Sites panel.

Optional Vercel hosting creates a protected project per site. Set `DSH_SITES_VERCEL_TOKEN` and `DSH_SITES_VERCEL_TEAM_ID` outside committed files, then restart the trade profile. The `siteHosting` configuration controls request timeouts, response and upload byte limits, and recovery pagination. Configuration requires both credentials; they stay in the Host and are never included in source uploads or browser responses. The provider requires Vercel Authentication for deployment URLs and disables automatic production domain assignment before uploading source. Preview visitors use their Vercel team account.

The Sites panel stages the selected revision, displays build status and opens its protected cloud preview. Static HTML is compiled from virtual files and uploaded with browser assets under a static output directory; generated package scripts do not run. Next.js source builds on Vercel, and generated `vercel.json` or `.vercel/` settings are refused. After reviewing the cloud build, a human confirms its exact revision and source digest before requesting promotion. The provider promotes or rolls back that existing production build without rebuilding the current draft. Cloud acceptance remains pending until a status refresh verifies production routing. `site-hosting.sqlite` preserves deployments and pending operations separately from source revisions. Lost submission responses are reconciled by saved request identity and digest; an unconfirmed project creation requires inspection at Vercel before retrying.

Unpublishing pauses the Vercel project; resuming restores its existing production build. Both actions require confirmation of the observed live deployment and remain pending until provider inspection confirms availability. Build history and source revisions remain available while the website is offline.

Custom domain controls attach, verify and remove names from the site's hosting project. Attach and remove confirmation binds the observed hosting generation; concurrent changes require a refresh. The panel separates ownership verification records from routing records returned by Vercel. DNS changes remain the domain owner's responsibility. Platform domains are read-only, and the provider never transfers a domain from another project. `siteHosting.maxDomains` bounds domain discovery. Unconfirmed external operations retain a durable checkpoint for status refresh.

Cloud builds, promotion, availability, domain operations and recovery have local provider-wire tests. Real Vercel publication, DNS propagation and TLS readiness still require live account verification. Workspace audience and collaborator management, application secrets and durable application data are not yet exposed by this deployment. The existing Shopify-GEO publication remains a separate product projection.

`pnpm exec vitest run --config trade/enterprise/vitest.sites.config.ts` checks hosting persistence and the provider protocol. `node --test trade/enterprise/test/sites-browser.test.mjs` starts the built `trade` profile with an isolated home and exercises source previews, edits, restoration and exact-version publication review with simulated cloud responses. It writes desktop/mobile evidence under `.trade-runtime/sites-evidence/`. The authored [missing-preview Session](../../snapshots/session/site-preview-missing/snapshot.yml) replays a real profile's tool refusal and pins the model-visible tool definitions; it does not prove live model generation. Model-driven creation and production deployment still require live-model and live-provider verification.

## Enterprise computers

The **Enterprise computers** sidebar binds existing Grokbot workstations to scoped HTTP credentials, explicit job disclosure, enterprise assets and human acceptance. See the [computer reference](computers.md) for setup, connector requests, cancellation and provider limitations.

## Development verification

The [development helper](../dev.ps1) installs this package with its npm lockfile after the root pnpm install, and builds it after the upstream application. Both Host and browser artifacts load through the `trade` dsh profile.

From the repository root, after the upstream build and this package's dependency installation:

```powershell
node trade/enterprise/build.mjs
node node_modules/typescript/bin/tsc -p trade/enterprise/tsconfig.host.json
node node_modules/typescript/bin/tsc -p trade/enterprise/tsconfig.client.json
node --test trade/enterprise/test/storage.test.mjs
node --test trade/enterprise/test/browser.test.mjs
```

Storage tests mount the built plugin with the real Connection registry in private temporary directories. The browser test launches a real dsh profile on an assigned port with isolated enterprise storage; it requires Edge on Windows or Playwright Chromium elsewhere. It exercises profile creation, image and video rendering, rename, refresh, deletion and responsive layout. Screenshots are written to the ignored `.trade-runtime/enterprise-evidence/` directory. No model key is required by these tests.
