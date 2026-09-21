/** Language variants share assets and link only to translated pages that actually exist. */
import { parse, parseFragment, serialize, defaultTreeAdapter, type DefaultTreeAdapterMap } from 'parse5'
import type { SiteProject } from '../../../packages/site/site/src/types.ts'

/** Prefix localized document paths without translating or rewriting business text.
 * @param variants - Primary language first; other languages have explicit directory prefixes.
 * @returns One portable static project with language links and hreflang metadata.
 */
export function localizeCompanyProject(variants: readonly { locale: string; prefix: string; project: SiteProject }[]): SiteProject {
  type Node = DefaultTreeAdapterMap['node']
  const files = variants.flatMap((variant, index) => variant.project.files.flatMap(file => {
    if (!file.path.endsWith('.html')) return index ? [] : [file]
    const document = parse(file.content)
    const absolute = (value: unknown, key?: string): unknown => {
      if ((key === 'url' || key === '@id') && typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return '/' + variant.prefix + value.slice(1)
      if (Array.isArray(value)) return value.map(item => absolute(item, key))
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([property, item]) => [property, absolute(item, property)]))
      return value
    }
    const links = variants.filter(item => item.project.files.some(candidate => candidate.path === file.path)).map(item => ({ locale: item.locale, path: '/' + item.prefix + file.path.replace(/index\.html$/, '') }))
    const walk = (node: Node) => {
      if ('tagName' in node) {
        for (const attr of node.attrs) if (attr.name === 'href' && attr.value.startsWith('/') && !attr.value.startsWith('//') && !attr.value.endsWith('.css')) attr.value = '/' + variant.prefix + attr.value.slice(1)
        if (node.tagName === 'script' && node.attrs.some(attr => attr.name === 'type' && attr.value === 'application/ld+json')) {
          const data = node.childNodes.map(child => 'value' in child ? child.value : '').join('')
          node.childNodes = []; defaultTreeAdapter.insertText(node, JSON.stringify(absolute(JSON.parse(data))).replaceAll('<', '\\u003c'))
        }
      }
      if ('childNodes' in node) for (const child of [...node.childNodes]) walk(child)
      if ('tagName' in node && (node.tagName === 'head' || (node.tagName === 'nav' && node.attrs.some(attr => attr.name === 'id' && attr.value === 'navigation')))) {
        const html = links.map(link => node.tagName === 'head' ? `<link rel="alternate" hreflang="${link.locale}" href="${link.path}">` : `<a lang="${link.locale}" href="${link.path}">${link.locale === 'en' ? 'English' : '中文'}</a>`).join('')
        for (const child of [...parseFragment(html).childNodes]) defaultTreeAdapter.appendChild(node, child)
      }
    }
    walk(document)
    return [{ ...file, path: variant.prefix + file.path, content: serialize(document) }]
  }))
  return { framework: 'static', files }
}
