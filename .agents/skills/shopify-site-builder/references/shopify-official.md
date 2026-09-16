# Shopify official references

These links and facts were checked against Shopify developer documentation on 2026-09-15.

- [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/latest): the current page lists released API versions and states that Admin GraphQL requests use `X-Shopify-Access-Token` and requested access scopes.
- [Authorization code grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant): merchant authorization requires app credentials, a configured redirect URI, known scopes, callback validation, and code exchange for an offline access token.
- [Webhooks](https://shopify.dev/docs/apps/build/webhooks): subscriptions can be declared in `shopify.app.toml` or through Admin GraphQL; verify HMAC and ignore duplicates using `X-Shopify-Webhook-Id`.
- [Shopify CLI for themes](https://shopify.dev/docs/storefronts/themes/tools/cli): theme access can use a Shopify account, Theme Access password, or custom app access token; account access requires the appropriate theme permission.

Re-read these pages when Shopify changes API versions, authentication guidance, webhook headers, or CLI behavior. Do not copy a version number or scope list into a model prompt; keep deployment choices in provider configuration.
