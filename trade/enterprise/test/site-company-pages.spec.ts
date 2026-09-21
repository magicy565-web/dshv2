/** Editorial suggestions preserve reviewed pages and require useful selection facts. */
import { expect, it } from 'vitest'
import { siteCompanyContent } from '../src/site-company-schema.ts'
import { suggestCompanyPages } from '../src/site-company-pages.ts'

const product = { slug: 'coupling', name: 'Coupling', description: 'Reviewed machinery component', applications: ['Assembly'], specifications: [{ name: 'Diameter', value: '12 mm' }], customers: ['Equipment builders'], differences: ['Reviewed drawing'], limitations: ['Indoor use'], evidence: [{ title: 'Drawing', citation: 'Public drawing', url: 'https://example.test/drawing' }] }
const company = (products: unknown[]) => siteCompanyContent.parse({ name: 'Acme', description: 'Industrial components', business: '', email: '', phone: '', address: '', qualifications: [], products })

it('includes customer, specification, characteristic and limitation facts without duplicate industry pages', () => {
  const input = company([product, { ...product, slug: 'guide', name: 'Guide' }])
  const result = suggestCompanyPages(input, 'en')
  expect(result.pages.map(page => page.kind)).toEqual(['solution', 'comparison'])
  expect(result.pages[0]?.sections).toEqual(expect.arrayContaining([
    { title: 'Coupling · Intended customers', body: 'Equipment builders' },
    { title: 'Coupling · Published specifications', body: 'Diameter: 12 mm' },
    { title: 'Coupling · Product characteristics', body: 'Reviewed drawing' },
    { title: 'Coupling · Limitations', body: 'Indoor use' },
  ]))
  expect(result.pages[0]?.sources).toEqual([{ title: 'Drawing', url: 'https://example.test/drawing' }])
  expect(suggestCompanyPages(result, 'en')).toEqual(result)
  expect(input.pages).toEqual([])
})

it('omits unsupported suggestions and retains human-authored pages', () => {
  const input = company([{ ...product, specifications: [], customers: [], differences: [], limitations: [] }])
  expect(suggestCompanyPages(input, 'en').pages).toEqual([])
  input.pages = [{ kind: 'case', slug: 'reviewed', title: 'Reviewed case', summary: 'Published results', sections: [{ title: 'Result', body: 'Verified result' }], sources: [] }]
  expect(suggestCompanyPages(input, 'zh-CN')).toEqual(input)
})

it('bounds generated pages and sections to the saved content limits', () => {
  const input = company(Array.from({ length: 10 }, (_, index) => ({ ...product, slug: `part-${index}`, name: `Part ${index}`, limitations: ['x'.repeat(5000), 'y'.repeat(5000)] })))
  const output = suggestCompanyPages(input, 'zh-CN')
  expect(siteCompanyContent.parse(output)).toEqual(output)
  expect(output.pages[0]?.sections).toHaveLength(30)
  expect(output.pages[0]?.sections).toContainEqual({ title: 'Part 0 · 适用限制', body: 'x'.repeat(5000) })
  input.pages = Array.from({ length: 50 }, (_, index) => ({ kind: 'case', slug: `case-${index}`, title: `Case ${index}`, summary: 'Reviewed case', sections: [{ title: 'Result', body: 'Verified result' }], sources: [] }))
  expect(suggestCompanyPages(input, 'en').pages).toEqual(input.pages)
})
