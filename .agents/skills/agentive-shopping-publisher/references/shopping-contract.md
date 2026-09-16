# Shopping contract

Keep these records separate and immutable where they cross a model or Session boundary:

- `ShoppingIntent`: shopper and tenant scope, constraints, selected product/variant IDs, quantity, destination, budget, delivery preference, and exclusions.
- `OfferSnapshot`: opaque offer ID, store/tenant, product and variant, seller, price, currency, inventory status, shipping/tax estimates, policies, explanation, source, and `retrievedAt`.
- `CartSnapshot`: opaque cart ID, line items, totals, currency, applied discounts, checkout URL state, and `snapshotAt`.
- `PurchaseConfirmation`: cart ID, offer/cart version, exact totals, shipping destination and method, tax/fee uncertainty, policy references, confirmation time, and actor.
- `OrderReference`: opaque order ID, merchant/store, status, total/currency, created time, and supported cancellation/return links.

An offer expires when its configured freshness window elapses or when the provider reports a price, inventory, shipping, or policy change. A cart mutation creates a new snapshot. Checkout accepts only the latest snapshot and confirmation for the same cart.
