/** Editorial drafts reuse public facts; case outcomes require separately reviewed evidence. */
import type { SiteCompanyContent } from './site-company-schema.ts'

/** Suggest application and comparison pages only when public facts add selection detail.
 * @param content - Reviewed public company content.
 * @param locale - Interface language; business text retains its supplied language.
 * @returns Content with bounded new pages, preserving every existing editorial page.
 */
export function suggestCompanyPages(content: SiteCompanyContent, locale: 'en' | 'zh-CN'): SiteCompanyContent {
  const zh = locale === 'zh-CN'
  const candidates: SiteCompanyContent['pages'] = []
  const sources = (products: SiteCompanyContent['products']) => [...new Map(products.flatMap(product => product.evidence.flatMap(item => item.url ? [[item.url, { title: item.title, url: item.url }] as const] : []))).values()].slice(0, 30)
  const sections = (products: SiteCompanyContent['products']) => products.slice(0, 6).flatMap(product => {
    const bounded = (items: string[]) => {
      const selected: string[] = []
      for (const item of items) { if ([...selected, item].join('; ').length > 5000) break; selected.push(item) }
      return selected.join('; ')
    }
    return [
      { title: product.name, body: product.description },
      ...([
        [zh ? '适用客户' : 'Intended customers', product.customers],
        [zh ? '公开参数' : 'Published specifications', product.specifications.map(fact => `${fact.name}: ${fact.value}`)],
        [zh ? '产品特点' : 'Product characteristics', product.differences],
        [zh ? '适用限制' : 'Limitations', product.limitations],
      ] as const).flatMap(([label, facts]) => {
        const body = bounded(facts)
        return body ? [{ title: `${product.name} · ${label}`.slice(0, 5000), body }] : []
      }),
    ]
  })
  const detailed = content.products.filter(product => product.specifications.length || product.differences.length || product.limitations.length || product.customers.length)
  const applications = [...new Set(detailed.flatMap(product => product.applications))]
  for (const [index, application] of applications.entries()) {
    const products = detailed.filter(product => product.applications.includes(application))
    candidates.push({ kind: 'solution', slug: `application-${index + 1}`, title: application, summary: zh ? `核对 ${application} 的公开参数、适用客户及限制；具体适用性需要企业确认。`.slice(0, 5000) : `Review published specifications, intended customers and limitations for ${application}; confirm suitability with the company.`.slice(0, 5000), sections: sections(products), sources: sources(products) })
  }
  if (detailed.length > 1) candidates.push({ kind: 'comparison', slug: 'product-selection', title: zh ? '产品资料对比' : 'Compare product information', summary: zh ? '根据企业公开资料核对需求；未列出的参数不代表产品不支持。价格、交期和适用性需要另行确认。' : 'Compare published facts; an unlisted specification does not mean a product lacks it. Confirm price, lead time and suitability with the company.', sections: sections(detailed), sources: sources(detailed) })
  const occupied = new Set(content.pages.map(page => `${page.kind}/${page.slug}`))
  return { ...content, pages: [...content.pages, ...candidates.filter(page => !occupied.has(`${page.kind}/${page.slug}`) && !content.pages.some(existing => existing.kind === page.kind && existing.title === page.title)).slice(0, 50 - content.pages.length)] }
}
