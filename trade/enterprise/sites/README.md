---
description: "Company-record generation, self-hosted static publication and a private inquiry inbox."
kind: "package-reference"
---

# Self-hosted company websites

English | [中文](README.zh.md)

## Summary

The Sites workspace creates a website from reviewed company records, publishes a fixed static version on the existing Host port, and receives visitor inquiries in a private inbox. Local publication does not require Vercel. Running the same deployment on a company server provides the same routes; no automatic upload or tunnel to another server is configured.

## Company content

The workspace separates **Website**, **Publish**, **Inquiries** and **Analytics**. Company records are the primary creation path; conversation and template creation are under **Other creation options**. The inquiry inbox has an empty state and a status filter.

Choose **Review company records**, inspect the projected facts and contact details, and confirm their use on a public website. Creation compares the digest against a fresh projection; changed facts require another review. The initial website remains a private draft. Company name, description, business and contact details come from the submitted profile. Products require confirmed GEO records with current human fact verification and passing product readiness; confirmed successors exclude their predecessors. Only public product claims are included, and private evidence paths are omitted. Company qualifications require public, verified, unexpired string claims. Missing products and qualifications produce contact guidance, never sample facts. Layout labels support English and Chinese. Public content is reviewed separately for each language; local-model translation produces an editable draft. Language navigation and hreflang link only to existing counterparts.

The installed `company-manufacturing@3.0.0` provider accepts explicit content and the industrial, precision or international style. It shares template version pinning, source-edit protection, revision history and ZIP export with the illustrative manufacturing provider. Publication freezes the reviewed content; later profile changes or fact expiry do not automatically modify the website. Review and generate a new draft when business facts change.

## Local publication

Select a saved static revision, choose **Review local publication**, inspect the website preview, confirm public content, then choose **Publish on this service**. Every HTML page is compiled from saved files before publication. Missing imports or an oversized compiled website reject preparation. A generation check prevents a stale publish or offline request from overwriting newer state. Publishing an earlier prepared revision restores that exact version. Editing a draft does not change the live website.

Publication review lists the public address, generated pages, consultation and tracking configuration. These checks do not establish public HTTPS availability, model quality or receipt of analytics events.

Public pages use `/sites-live/<site-id>/` on the current port. HTML, styles, scripts and embedded assets come from the prepared build; source receipts and private inbox records are not served. Pages use a sandboxed opaque origin without access to the editor's DOM or cookies. The response policy permits that site's inquiry route, its optional consultation route and the configured Umami origin; native form navigation is disabled. Static page compilation does not run generated scripts on the Host. Local publication supports HTML pages with bundled local dependencies; server-side Next.js execution, arbitrary asset downloads and dynamic server routes require another provider.

The independent `site-local.sqlite` database retains compiled versions, the live pointer and inquiries. `sites.sqlite` remains the source authority. Stop the Host before taking a consistent backup of both databases. Unpublishing stops page access and new inquiry reception without deleting history or the inbox. Shutdown drains public and authenticated requests before closing storage.

## Inquiry receipt and handling

The company website form posts to `/sites-live/<site-id>/_inquiries`. Success is displayed only after a durable receipt. A request identifier and content fingerprint deduplicate retries while the inquiry record is retained; changed content with the same identifier is rejected. Failed or uncertain submissions retain the form values and retry identity. A private preview or exported file does not claim to receive an inquiry.

The inbox displays the newest 100 inquiries and the total count. Authorized workspace users can mark records read, close them or permanently delete them. Receipt does not imply email or CRM delivery. Operators own response handling, access and deletion requests, and retention policy.

Public intake is intentionally unauthenticated. It requires JSON, consent, bounded fields and an empty honeypot, and enforces durable per-site hourly and total-record quotas. CORS allows sandboxed visitors without credentials; it is not proof of sender identity. Reverse-proxy request limits or additional bot protection are appropriate for Internet-facing deployment. No visitor IP address is stored by this receiver.

## GEO pages and traffic

Company imports generate company, catalog, product, application, qualification, contact and privacy pages. Available product facts also generate a buying guide and FAQ with visible answers. Organization, WebSite, WebPage, Product and FAQPage structured data follow their visible content; missing prices, certificates, cases and comparisons are not invented. Publication adds canonical URLs, a library-generated `sitemap.xml`, `robots.txt` and a supplementary `llms.txt` page index. Root robots lists online site sitemaps. Discovery content is retained with the exact compiled build, including its public origin. These files do not guarantee indexing or AI citations.

Traffic monitoring uses the open-source self-hosted edition of [Umami](https://docs.umami.is/docs/install). Once configured, website setup can create and connect a website automatically; manual tracker settings remain available at creation. Pages use the official tracker. Operations reads pageviews, visitors, visits, sources and events from the Umami API; complete reports remain in Umami. API failures appear as unavailable rather than zero traffic.

The tracker respects Do Not Track, omits URL fragments, keeps only `utm_source`, `utm_medium` and `utm_campaign` query values, and reduces referrers to origins through Umami's before-send hook. It reports pageviews and consultation/inquiry events without sending questions, answers, form fields or inquiry identifiers. Internal links carry attribution to the inquiry form without requiring browser storage. The inbox labels these fields as visitor-reported; they are not verified identities. Ad blockers and lost events can make analytics incomplete. Persisted inquiry receipts remain the authoritative inbox total; AI referrals do not establish crawler activity or model citations.

## Website product consultation

Configure an existing [self-hosted model route](../../../packages/llm/llm-pi-ai/README.md), then set enterprise `siteAgent` with that route's explicit `provider` and `model`. The deployment patch accepts this object through `DSH_SITES_AGENT_JSON`. Enable the product consultant during company creation. It uses published public facts, a fresh Harness Agent and no tools or ambient workspace prompt. Requests are logged through the existing Session mechanism; operators own access, retention and deletion. The browser keeps bounded conversation history and renders answers as text. Preparing an inquiry copies the conversation into the form; submission still requires the visitor's explicit consent.

The validated limits are `maxTokens` (1024), `requestTimeoutMs` (60000), `maxQuestionsPerHour` (60), `maxContextCharacters` (60000) and `maxRequestBytes` (65536). Hourly usage persists across restarts and includes failed model calls. Cancellation disposes the request's Agent; changing the published build invalidates a pending answer. Missing configuration prevents an Agent-enabled build from being prepared. Inquiry reception remains available when the model is unavailable. No paid model route is selected automatically; local model installation and live response quality require operator verification.

## Website operations

Operations supports version-checked configuration, public content editing, industry/solution/case/comparison pages and translation drafts. Products with customer, specification, characteristic or limitation facts can generate application and comparison drafts; the generator preserves reviewed pages and does not add matching industry pages. Case outcomes require separately verified content. Refreshing company facts preserves editorial pages and removes translations pending review. Manually edited source refuses template replacement. Saving a draft and publishing it are separate operations; a changed company projection prompts review of published content.

Content and operating settings remain in the form when switching between the four site tabs. Unsaved edits block site replacement, revision switching, publication and workspace refresh; browser reload requests confirmation. Save or discard edits before continuing. Content or integration changes clear the public-content confirmation. Failed saves retain input for retry. A statistics-period change does not overwrite edited settings or adopt a newer settings version for saving. Switching to another application panel is blocked until edits are saved or discarded and content or settings operations finish. Drafts are not durable until saved; browser reload or closing the application can discard them after confirmation.

Per-site settings control scheduled SearXNG searches, ntfy notifications and EspoCRM Lead synchronization; credentials remain in Host configuration. Manual AI citations, website-model tests, search results and unverified User-Agent crawler aggregates carry distinct labels. Inquiries create enterprise follow-up tasks with the same identifier; repeating the action returns the existing task. External delivery persists a claim first and never automatically retries uncertain acceptance. CRM can reconcile an existing Lead; operators can confirm retry after checking the destination. Deleting local inquiries does not delete external copies.

`DSH_SITES_SERVICES_JSON` supplies `siteServices`; [site-services.ts](../src/site-services.ts) owns its fields. `retentionDays` controls periodic removal of search, citation, model-test and crawler evidence; inquiries, model Sessions and external services retain their own policies. The inquiry-count/Umami-visit ratio is not deduplicated visitor conversion. The [self-hosting guide](deploy/README.md) covers container composition, private access, acceptance and backup.

## Management and review

**Manage website** provides version-checked rename, archive, restore and deletion. Take a website offline and finish or cancel its pending work before archiving. Archived websites remain readable under **Show archived websites**. Permanent deletion removes source, versions, local builds, inquiries and local integration records; Session audit records and external hosting or CRM data remain independently managed. A site with a recorded Shopify publication cannot be deleted through this action.

**Version comparison** shows added, removed and changed paths, text before/after, binary change notices and structured content differences. **Activity** reads the dedicated site Session and reconstructs its latest committed metadata, revision summaries and Shopify job state. Source versions remain authoritative.

## Shopify publication

Shopify publication accepts controlled page revisions, including a home page; it rejects standalone HTML/Next.js source projects. Connect a store through the theme authorization link, reopen the panel, select an unpublished theme, review every generated file and explicitly confirm the live-theme switch. The queued job fixes the revision, store, theme and file digest. **Refresh publication jobs** shows durable attempts and allows cancellation while queued. `siteShopify` configures request timeouts, polling, retry limits and jobs per tick; execution uses the existing `siteServices.pollIntervalMs` timer.

The Host resolves OAuth credentials afresh for each attempt. The adapter uses Shopify’s [theme file mutation](https://shopify.dev/docs/api/admin-graphql/2026-01/mutations/themeFilesUpsert), waits for asynchronous writes, promotes the selected theme and checks its live role. Theme writes require `write_themes` and Shopify approval. Rate limits and retryable reads have bounded retries; ambiguous writes and interrupted running jobs require provider reconciliation instead of automatic resubmission. The current live theme is preserved until promotion; an uncertain promotion can already have taken effect remotely. Test doubles verify these transitions; live-store acceptance requires an authorized development store.

## Deployment configuration

`siteLocal` is part of the enterprise plugin configuration. Its validated fields are `maxPublicationBytes` (default 16777216), `maxInquiryBytes` (16384), `maxInquiriesPerHour` (60), and `maxStoredInquiries` (10000). Both published bytes and inquiry records persist in the configured enterprise directory. This deployment serves one enterprise; use separate processes and data directories for separate organizations.

For local use, the existing [Trade launcher](../../README.md) starts the supported `dsh` profile on loopback. After publishing, open the URL shown in Sites. The website and inbox receiver stop when that process stops.

For a company server, install and build the same repository and enterprise plugin, retain its `templates/` directory, create the `trade` profile from the shipped `web` profile on first launch, and run the supported `dsh` CLI with the [deployment patch](../../cordis.patch.yml), a durable `DSH_HOME`, and a loopback listener. Put an HTTPS reverse proxy in front of `/sites-live/` and the public discovery routes `/robots.txt` and `/sitemap.xml`, forwarding paths unchanged. Keep `/api/`, authentication links and the workspace UI off that public route; access administration through the existing authenticated private connection. Set `DSH_SITES_PUBLIC_URL` (enterprise `publicBaseUrl`) to the external origin so inquiry CSP matches the visitor URL. Do not expose the entire local development workspace as a multi-tenant public service.

Server connection details, reverse-proxy configuration and a transfer API are deployment inputs. The local browser tests do not establish an upload to a remote server, public DNS or TLS availability.

## Verification

The source projection tests exercise visibility, verification, expiry, supersession and escaping. Local publication tests exercise exact versions, compilation failure, stale generation refusal, restart persistence, inquiry deduplication, quotas and inbox ownership. The real-profile browser scenario publishes company content, opens it without workspace credentials, simulates a lost inquiry response, retries without duplication, processes the inbox and confirms that unpublishing removes public access. Growth tests check discovery URLs, analytics isolation and consultation quotas. Browser coverage uses a scripted external model with the real Harness loop and a simulated Umami endpoint; it does not establish a live Umami deployment or local-model quality.
