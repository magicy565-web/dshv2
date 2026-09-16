# Publish checklist

Before release, verify:

- catalog, prices, inventory, shipping, taxes, discounts, and policies come from the resolved merchant store;
- stale offers and carts are rejected or refreshed;
- recommendations state why they match and disclose sponsored ranking;
- cart changes show exact deltas and totals;
- checkout and payment tokens never enter model prompts or logs;
- paid actions require explicit confirmation with the full material summary;
- retries are idempotent and cannot duplicate carts, discounts, or orders;
- order status and cancellation/return links are tenant- and shopper-scoped;
- webhook signatures and duplicate delivery handling are tested;
- keyless Session replay reconstructs offers, cart snapshots, confirmation, and checkout outcome;
- mobile UI keeps the total, currency, confirm action, and policy links clear.

For public or platform-owned stores, do not enable real payment until tax, refund, consumer-rights, chargeback, inventory, settlement, and prohibited-goods owners approve the operating model.
