/** Reviewed source projection excludes private, expired and superseded records. */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { profileSchema } from '../src/schema.ts'
import { geoRecord } from '../src/geo-schema.ts'
import { companySiteReview } from '../src/site-company-source.ts'
import { companyTemplateProvider, companyTemplateId, companyTemplateVersion } from '../src/site-company-template.ts'
import { SiteTemplateService } from '../../../packages/site/site/src/templates.ts'

const now = new Date('2026-09-21T00:00:00Z')
const profile = profileSchema.parse({ name: 'Acme <Engineering>', kind: 'enterprise', description: 'Precision products for industrial assemblies.', business: 'Industrial parts', website: '', contact: 'Private contact name', email: 'sales@example.test', phone: '', address: 'Export Park', logoId: null, trust: { claims: [
  { value: 'Public qualification', visibility: 'PUBLIC', status: 'VERIFIED' },
  { value: 'PRIVATE-CERT', visibility: 'WORKSPACE', status: 'VERIFIED' },
  { value: 'Expired certificate', visibility: 'PUBLIC', status: 'VERIFIED', validUntil: '2026-01-01T00:00:00Z' },
] } })
const product = geoRecord.parse({ id: '00000000-0000-4000-8000-000000000001', sessionId: 'fixture', revision: 1, kind: 'product', name: 'Reviewed coupling', description: '', sections: [], questions: '', status: 'confirmed', createdBy: 'user', confirmedAt: now.toISOString(), updatedAt: now.toISOString(), productVerifiedAt: now.toISOString(), product: {
  identity: { canonicalUrl: 'https://example.test/coupling', manufacturer: { id: 'maker', name: 'Acme', url: 'https://example.test/' }, aliases: [], category: ['Couplings'] }, locale: 'en',
  understanding: { directAnswer: 'Coupling for machinery', applications: ['Assembly'], targetCustomers: ['Engineers'], differentiators: ['Reviewed drawing'], limitations: [] },
  claims: [{ id: 'size', property: 'size', name: 'Size', category: 'technical', value: { type: 'number', value: 12, unit: 'mm' }, public: true, critical: true, status: 'declared', evidenceIds: ['drawing'], updatedAt: now.toISOString() }, { id: 'cost', property: 'cost', name: 'PRIVATE-COST', category: 'technical', value: { type: 'text', value: 'PRIVATE-VALUE' }, public: false, critical: false, status: 'declared', evidenceIds: [], updatedAt: now.toISOString() }],
  evidence: [{ id: 'drawing', title: 'PRIVATE-DOCUMENT', citation: 'PRIVATE-PATH', public: false, recordedAt: now.toISOString() }], offers: [], variants: [], solutions: [], media: [],
} })

describe('company website projection', () => {
  it('projects public facts and qualifications, and requires a submitted description', () => {
    const review = companySiteReview(profile, [product], 'local', now)
    expect(review.content?.products[0]?.specifications).toEqual([{ name: 'Size', value: '12 mm' }])
    expect(review.content?.qualifications).toEqual(['Public qualification'])
    expect(JSON.stringify(review)).not.toMatch(/PRIVATE|Private contact|Expired/)
    expect(companySiteReview(null, [], 'local', now).content).toBeNull()
    expect(companySiteReview({ ...profile, description: '' }, [], 'local', now).issues).toContain('profileMissing')
    expect(companySiteReview({ ...profile, email: 'new@example.test' }, [product], 'local', now).digest).not.toBe(review.digest)
  })
  it('omits unverified, expired and superseded product generations', () => {
    const unverified = geoRecord.parse({ ...product, productVerifiedAt: undefined })
    expect(companySiteReview(profile, [unverified], 'local', now).content?.products).toEqual([])
    const expired = geoRecord.parse({ ...product, product: { ...product.product, claims: product.product!.claims.map(claim => ({ ...claim, validUntil: '2026-01-01T00:00:00Z' })) } })
    expect(companySiteReview(profile, [expired], 'local', now).issues).toContain('productExcluded')
    const successor = geoRecord.parse({ ...product, id: '00000000-0000-4000-8000-000000000002', supersedesId: product.id, name: 'Replacement' })
    expect(companySiteReview(profile, [product, successor], 'local', now).content?.products.map(item => item.name)).toEqual(['Replacement'])
  })
  it('renders every design from the same escaped facts without sample products', async () => {
    const ctx = new Context()
    try {
      const templates = new SiteTemplateService(ctx)
      ctx.effect(() => templates.register(companyTemplateProvider))
      const content = companySiteReview(profile, [product], 'local', now).content
      for (const style of ['industrial', 'precision', 'international']) {
        const project = templates.generate({ id: companyTemplateId, version: companyTemplateVersion, parameters: { content, style, inquiryEndpoint: 'local' } })
        expect(project.files.filter(file => file.path.endsWith('.html'))).toHaveLength(10)
        const home = project.files.find(file => file.path === 'index.html')!.content
        expect(home).toContain('Acme &lt;Engineering&gt;')
        expect(home).toContain(`theme-${style}`)
        expect(home).not.toMatch(/Northline|Shaft couplings|PRIVATE/)
        expect(home).toContain('application/ld+json')
        expect(project.files.find(file => file.path === 'faq/index.html')?.content).toContain('Where is Reviewed coupling used?')
        expect(project.files.find(file => file.path === 'buying-guide/index.html')?.content).toContain('Engineers')
        expect(JSON.stringify(project)).not.toContain('PRIVATE-PATH')
        expect(templates.inspect(project).sourceEdited).toBe(false)
      }
    } finally { await ctx.fiber.dispose() }
  })
})
