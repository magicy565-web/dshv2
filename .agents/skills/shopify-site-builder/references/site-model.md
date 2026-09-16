# Site model

Represent a site as a tenant-owned record pointing to one opaque `StoreConnectionId`. A revision is immutable and contains source, creation time, base revision, and exact `SiteChangeSet`. A publish job references one revision and has queued, running, succeeded, failed, or cancelled status.

Allowed changes are controlled pages, SEO metadata, approved theme colors/fonts/layout, tenant-bound product ordering, and recommendation relationships. Reject unsafe paths, duplicate IDs, unknown theme fields, arbitrary Liquid/JavaScript, unbound products, and stale base revisions.

Rollback creates a new revision with source `rollback`; never mutate a published revision or infer rollback content from the live store.
