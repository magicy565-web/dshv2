# Agent Note: Site source projects independent of commerce

Status: implemented

English | [中文](2026-09-20-site-source-projects.zh.md)

## Problem

Workspace websites need to preserve editable source files and binary assets across conversations. Requiring a Shopify connection and storing only page titles prevents an independent website from being created or maintained.

## Decision

The Site service stores immutable source-project revisions with an optional commerce connection. Static projects build into deterministic file artifacts associated with an exact revision. Next.js source is stored without executing it; an isolated framework build provider is required before it can run. Source parsing rejects unsafe portable paths, credential filenames and invalid binary encodings.

The enterprise deployment owns site storage and trusted tenant identity. Its site tools create projects, read selected revisions, apply version-checked file edits, preview static projects and restore drafts. Tool inputs and results enter the existing tool-call Session log. Private previews compile only virtual project files and run browser code in an opaque sandbox; the compiler never resolves Host files or Host dependencies.

Static compilation retains responsive image candidates, inline CSS assets, conditional styles and deferred script timing so visual designs use ordinary browser features. Entry resolution uses the selected saved path even when esbuild rewrites its spelling because a Host file exists at the same path. Embedded page navigation uses a message from the current iframe to its parent because opaque-frame requests cannot authenticate directly against the editor. The parent retains the site and revision and changes only the requested page; it never grants same-origin access. Compiler diagnostics identify project files without Host stack paths. Browser fixtures cover three visual styles, responsive layouts, interaction and navigation; a live-model acceptance command separately checks generated source after the agent process exits. Absent credentials skip live acceptance rather than count as success.

Independent hosting records source revisions and provider builds separately. The enterprise consumer uses a replaceable provider interface and dedicated SQLite records. Its Vercel provider stages production builds with protected deployment URLs and automatic domain assignment disabled. Human publication approval identifies an existing build and source digest, so later draft edits cannot change what is promoted. A successful submission does not imply production routing has changed: the live record advances only after provider inspection. Unknown submissions retain their checkpoint and are reconciled by request identity and digest instead of being resubmitted.

Unpublishing pauses the provider project without deleting deployments; resuming preserves the production build. Availability and domain changes persist their request before contacting the provider, and status refresh reconciles uncertain responses. Domain confirmation binds the observed hosting generation. Ownership verification and DNS routing remain separate observations because proving control of a name does not establish that visitors reach the website.

Manual asset imports join the versioned project instead of a separate mutable asset directory. Replacing a file therefore affects only the new revision, and historical previews retain their original bytes. The editor checks the encoded revision request size, since binary-to-base64 expansion and existing source consume the same Host limit. ZIP export preserves ordinary relative filenames so source remains usable outside the platform.

The manufacturing starter provides a reviewed multi-page composition as ordinary saved source. Both editor creation and `site_create` use the same project and revision service, so customization, preview and export retain their existing behavior. A prompt alone cannot guarantee a coherent product catalog and inquiry path. Illustrative images and sample company facts are explicitly identified; an inquiry creates a local draft until a real contact channel is configured. Size validation precedes site creation. Browser verification covers all ten pages at desktop and mobile widths, product filtering, cross-page product selection and unsent inquiry drafting.

Template generation is owned by the Site package's provider registry. The enterprise deployment supplies the manufacturing implementation and registers its exact version; editor and model consumers share its input schema and renderer. A source-local receipt records resolved parameters, provider version and a digest of generated files. Recomposition refuses changed source instead of attempting to infer lost component structure from arbitrary HTML. Provider upgrades do not affect saved source, and missing providers prevent regeneration without preventing preview or export. This deliberately gives up automatic template migration and merging of manual edits. Initial site and revision creation share one storage transaction so a failed commit cannot expose an empty template site.

Next.js tool previews submit once per saved revision and inspect the same deployment on later calls. Build polling is independent of production routing and DNS inspection, so unavailable domain services do not prevent review of a draft. Tool results distinguish building, failed and uncertain states from a ready preview. Publication remains a separate human review of an existing build.

Build failure and diagnostic availability are separate observations. The provider returns an owned build's failure summary even when its log endpoint fails, and persistence retains a bounded log tail once available. Missing diagnostics can be queried again without repeating the build. This preserves the information needed for source repair without misclassifying a confirmed failure as an uncertain submission.

The [Shopify capability decision](2026-09-15-shopify-site-capability-seams.md) continues to own commerce provider separation and publication jobs. The [commerce completion proposal](../../proposed/architecture/2026-09-15-shopify-site-completion.md) concerns the optional commerce layer; it does not make commerce a prerequisite for an independent website.

The welcome animation uses one persistent illustrative website across editing, preview, file transfer, version restoration and publication. Its controls carry no source or hosting authority: sample success indicators never update persisted records. This separation allows a continuous product demonstration without mistaking it for a saved preview or a publication receipt. Manual chapter selection and reduced-motion preferences provide static scenes; automatic playback stops after the publication chapter. Browser verification checks playback, pause, the persistent website element, reduced motion, mobile layout and absence of site mutations.

Self-hosted publication stores compiled HTML independently of the draft pointer and serves it through a public prefix on the existing Host port. A separate durable generation protects exact-build promotion and offline changes. Public pages retain an opaque-origin CSP sandbox; native form navigation is blocked, while script requests can reach only the site's public inquiry receiver. This permits local use and reverse-proxy hosting without granting generated code the authenticated editor's origin privileges. It does not transfer a local project to another server.

Company imports bind human review to a fresh content digest, project only currently publishable product facts and public verified qualifications, and preserve the resulting parameters in the template receipt. Inquiries are public input rather than model instructions: bounded JSON, retained request identities, per-site quotas and a private inbox separate receipt from email delivery. The receipt is returned only after the SQLite commit. Browser evidence covers anonymous visitors and a response lost after acceptance; retrying preserves one record.


## Alternatives considered

**Keep Shopify mandatory.** Rejected because company websites, games and internal applications can exist without a store, and their source lifecycle belongs to the Workspace.

**Execute generated build scripts in the enterprise Host.** Rejected because the Host holds company documents and service credentials. Static preview compilation parses virtual files; server-side framework builds require a separate execution environment.

**Store only generated HTML.** Rejected because editable modules and binary assets must survive historical comparisons and restoration. The source project and its built artifact have separate representations.

**Rebuild the latest draft when publishing.** Rejected because the resulting website could differ from the reviewed preview. Staged production builds preserve the deployment identity when promoted or rolled back.

**Retry every failed cloud request.** Rejected because a lost response may follow successful external acceptance. Durable checkpoints prevent duplicate submissions after a network failure or process restart.

## Consequences

SQLite restore, revision comparison and rollback preserve project files. A missing commerce connection fails only a Shopify publication attempt. Unit and enterprise Host tests cover source retention, stale edit rejection, preview isolation and tool disposal. Provider tests cover staging, exact-build promotion, availability, domains, concurrency and recovery; browser tests exercise saved source and hosting controls with simulated cloud responses. Cloud credentials remain deployment configuration and never enter generated source. The Vercel integration requires live account verification, including DNS and TLS; audience controls, application secrets and durable application data remain incomplete. Local tests do not establish a complete Sites product or successful live cloud publication.
