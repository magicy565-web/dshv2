# Enterprise workspace plugin

English | [中文](README.zh.md)

This private deployment plugin contributes **Enterprise workspace** to the native sidebar and main slots. It reuses Harness authentication, locale dictionaries, React primitives and the browser module loader. SQLite owns the local records; `file-type`, Zod and `range-parser` provide file detection, input validation and media ranges.

## User records

### Chat onboarding

Before a company profile exists, Enterprise workspace offers only **Start onboarding**. The button opens a new chat and sends the native `/enterprise-onboarding` invocation, which loads the bundled [skill](skills/enterprise-onboarding/SKILL.md). Its fixed sequence checks existing records, understands the business, gathers sources, refines drafts, and requests confirmation within chat. Questions and sections follow the user's business, not an industry form. Existing profiles retain an **Onboarding / settings** entry.

The deployment's SQLite `enterprise_geo` table retains company and product drafts, sources, unresolved questions, revisions, and calling session ids. The chat review service obtains the human answer before confirmation; stale reviews cannot confirm edited content. Confirmation creates a basic company profile only when none exists. GEO sections remain private and do not feed the existing machine-readable projections. This local deployment is not a tenant-isolated service, and confirmation is neither commercial verification nor publication.

Built-plugin tests verify native skill loading, draft persistence, rejected and stale confirmations, and dynamic fields. Browser tests verify the single-button entry and chat navigation; they do not prove a complete real-model onboarding conversation or recorded-session replay.

**Continue onboarding** reopens the persisted conversation after a browser reload; an unavailable conversation is replaced and the skill reads saved progress. Confirmed records can receive a separate revision draft without losing their original content. Completion requires the user's in-chat confirmation of the exact records included in this task, not merely one saved product. Any draft change invalidates completion. Chat documents are read through session-owned attachment references and returned with chunk citations. Onboarding conversations enforce a knowledge-tool allowlist; shell, filesystem, and direct profile-write tools cannot bypass review.

The first visit creates one user-named company or studio. Its profile contains a logo, description, products/services, website and contact details. The asset tab supports multiple-file upload, category filtering, name search, image/video preview, download, rename and confirmed deletion. Logo selection uses an uploaded image. Removing that image also clears the profile logo. Files are not sent to a model or added to a knowledge index.

Supported uploads are JPEG, PNG, WebP, GIF, AVIF, MP4, WebM, QuickTime, PDF, DOCX, XLSX, PPTX, ZIP and UTF-8 TXT/CSV/Markdown. Binary formats are detected from content; a supplied MIME type cannot enable an unsupported format. Documents download as attachments. Video playback depends on the browser's codec support. Uploads run one at a time; a batch keeps earlier successful files if a later upload fails.

## Storage and configuration

### Structured GEO products

Product drafts accept an optional structured `product` with identity, direct answer, intended customers, typed claims, evidence, media, variants, solution links and offers. Claims own fact values; offers reference commercial claims and supply currency, ordering unit, region and expiry. Fabric GSM aliases normalize to `g/m²`, and width measurements normalize to centimeters. Unknown commercial values remain unknown. Free-text records remain readable but do not satisfy structured-product readiness.

`enterprise_geo_status` returns independent Entity, Understanding, Facts, Evidence and Discovery results with blocking reasons. The ordinary draft confirmation does not verify product facts. `enterprise_geo_verify` obtains a separate human source-check attestation for the exact confirmed revision; model input cannot set that receipt. Missing sources, public inferred/conflicted facts, invalid measurements and expired commercial claims block preview. Human attestation is not independent certification. Revisions require a fresh attestation.

Authenticated `GET /api/enterprise/products/readiness?id=<record-id>` returns the same readiness report. `GET /api/enterprise/products/preview?id=<record-id>` compiles HTML, and `&format=jsonld` selects matching JSON-LD. Both outputs exclude private claims and private evidence, recheck validity on every request, and carry `no-store` and `noindex` headers. Discovery remains PARTIAL: there is no public deployment, sitemap publication, crawler verification, multilingual entity resolver, automatic monitoring or guaranteed search inclusion. Full real-model and recorded-session coverage of structured product onboarding remains absent.

The [deployment overlay](../cordis.patch.yml) supplies the absolute `directory`, `maxFileBytes` and `maxTotalBytes`. Its limits are 256 MiB per file and 2 GiB per enterprise. The default directory is `.trade-runtime/enterprise/`, with `enterprise.sqlite` and private UUID-named files under `files/`. Back up this entire directory while the server is stopped. SQLite `user_version` is monotonic; unsupported versions fail at startup.

Authenticated `/api/enterprise` routes expose the profile and metadata, while `/api/enterprise/file` serves validated asset ids with byte-range support. Display names never address disk paths. The database commits uploaded files only after their streamed write and type validation succeed. Startup removes interrupted writes and files without metadata. A deleted file locked by a media reader can remain on disk until the next startup.

This is one enterprise per local deployment, with access controlled by the existing browser login. It does not implement multi-account membership, tenant isolation, public sharing, file conversion or knowledge ingestion. The schema and Host own record consistency; the plugin has no separate invariant installer.

## Canonical Company Entity

The profile stores a compatible projection of the Workbuddy Company Entity, not just display text. First submission generates a stable `companyEntityId` (`cmp_...`); `identity`, `offerings`, `fit`, `capabilities`, `constraints` and `trust` own the facts. Legacy fields such as `name` and `business` remain as editor compatibility fields.

Facts can carry a `status` (`VERIFIED`, `SELF_DECLARED`, `INFERRED`, `UNKNOWN`, `OUTDATED`, `CONFLICTED`), `visibility` (`PUBLIC`, `AGENT`, `WORKSPACE`, `RESTRICTED`), sources, update time and expiry. Public output must not treat internal fields as public facts.

Machine-readable endpoints:

- `/api/enterprise/public`: projects public Company Entity fields.
- `/api/enterprise/agent`: projects public fields and agent-accessible capabilities and constraints.

Both endpoints project the same SQLite company record, without a second JSON or page data source. They do not replace authenticated workspace endpoints; public deployment still requires the Web routing layer to configure caching, canonical URLs, robots and JSON-LD.

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

Storage tests mount the built plugin with the real Connection registry in private temporary directories. The browser test creates a fresh Web profile on an assigned port with isolated settings and enterprise storage; it requires Edge on Windows or Playwright Chromium elsewhere. It exercises profile creation, image and video rendering, rename, refresh, deletion and responsive layout. Screenshots and profile data belong to the test's temporary directory and are removed during cleanup. No model key is required by these tests.
