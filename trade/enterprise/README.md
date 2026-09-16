# Enterprise workspace plugin

English | [中文](README.zh.md)

This private deployment plugin contributes **Enterprise workspace** to the native sidebar and main slots. It reuses Harness authentication, locale dictionaries, React primitives and the browser module loader. SQLite owns the local records; `file-type`, Zod and `range-parser` provide file detection, input validation and media ranges.

## User records

### Chat onboarding

Before a company profile exists, Enterprise workspace offers only **Start product GEO**. The button opens a new chat and sends the native `/product-geo` invocation, which loads the bundled [skill](skills/product-geo/SKILL.md). Its fixed sequence checks existing records, understands the business, gathers sources, refines drafts, and requests confirmation within chat. Questions and sections follow the user's business, not an industry form. Existing profiles retain a **Product GEO** entry.

The deployment's SQLite `enterprise_geo` table retains company and product drafts, sources, unresolved questions, revisions, and calling session ids. The chat review service obtains the human answer before confirmation; stale reviews cannot confirm edited content. Confirmation creates a basic company profile only when none exists. GEO sections remain private and do not feed the existing machine-readable projections. This local deployment is not a tenant-isolated service, and confirmation is neither commercial verification nor publication.

Built-plugin tests verify native skill loading, draft persistence, rejected and stale confirmations, and dynamic fields. Browser tests verify the single-button entry and chat navigation; they do not prove a complete real-model onboarding conversation or recorded-session replay.

**Continue onboarding** reopens the persisted conversation after a browser reload; an unavailable conversation is replaced and the skill reads saved progress. Confirmed records can receive a separate revision draft without losing their original content. Completion requires the user's in-chat confirmation of the exact records included in this task, not merely one saved product. Any draft change invalidates completion. Chat documents are read through session-owned attachment references and returned with chunk citations. Onboarding conversations enforce a knowledge-tool allowlist; shell, filesystem, and direct profile-write tools cannot bypass review.

The first visit creates one user-named company or studio. Its profile contains a logo, description, products/services, website and contact details. The asset tab supports multiple-file upload, category filtering, name search, image/video preview, download, rename and confirmed deletion. Logo selection uses an uploaded image. Removing that image also clears the profile logo. Files are not sent to a model or added to a knowledge index.

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

This is one enterprise per local deployment, with access controlled by the existing browser login. It does not implement multi-account membership, tenant isolation, public sharing, file conversion or knowledge ingestion. The schema and Host own record consistency; the plugin has no separate invariant installer.

## Canonical Company Entity

The profile stores a Workbuddy Company Entity compatible projection rather than display text alone. The first submission assigns a stable `companyEntityId` (`cmp_...`); `identity`, `offerings`, `fit`, `capabilities`, `constraints` and `trust` are the authoritative facts. Legacy fields such as `name` and `business` remain as editor-compatible fields.

Facts may carry `status` (`VERIFIED`, `SELF_DECLARED`, `INFERRED`, `UNKNOWN`, `OUTDATED`, `CONFLICTED`), `visibility` (`PUBLIC`, `AGENT`, `WORKSPACE`, `RESTRICTED`), source, update time and validity. Public projections do not expose internal fields as public facts.

Machine-readable endpoints:

- `/api/enterprise/public`: public Company Entity projection.
- `/api/enterprise/agent`: public fields plus capabilities and constraints available to the Agent.

Both endpoints project the same SQLite enterprise record; they do not maintain a second JSON or webpage source. They do not replace the authenticated workspace API. Public hosting still configures cache policy, canonical URLs, robots and JSON-LD at the Web route.

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
