/** Fictional catalog input; timestamps are fixed and no network resource is acquired. */
export function productFixture() {
  return {
    identity: { canonicalUrl: 'https://example.com/en/products/r821', manufacturer: { id: 'maker', name: 'Example Textile', url: 'https://example.com/company#organization' }, aliases: ['Printed Viscose'], category: ['Fabric'], sku: 'R-821' },
    locale: 'en',
    understanding: { directAnswer: 'R-821 is a printed viscose fabric for dresses.', applications: ['Dresses'], targetCustomers: ['Apparel designers'], differentiators: ['Custom prints'], limitations: ['Indoor apparel'] },
    claims: [{ id: 'weight', property: 'fabric_weight', name: 'Fabric weight', category: 'technical', value: { type: 'number', value: 120, unit: 'g/m²' }, public: true, critical: true, status: 'declared', evidenceIds: ['catalog'], updatedAt: '2026-01-01T00:00:00Z' }],
    evidence: [{ id: 'catalog', title: 'Product catalog', citation: 'Page 4, item R-821', recordedAt: '2026-01-01T00:00:00Z', public: true }],
    offers: [], variants: [], solutions: [], media: [],
  }
}
