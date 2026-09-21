/** Company websites render only explicit reviewed facts; absent evidence produces no invented claims. */
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SiteTemplateId, SiteTemplateProvider, SiteTemplateParameters } from '../../../packages/site/site/src/template-types.ts'
import type { SiteProject } from '../../../packages/site/site/src/types.ts'
import { siteCompanyContent } from './site-company-schema.ts'
import { localizeCompanyProject } from './site-company-localization.ts'
import { companyZh } from './site-company-copy.ts'
import { siteGrowth } from './site-growth-schema.ts'

/** Installed provider id for real company content, independent of the illustrative starter. */
export const companyTemplateId = brandString<SiteTemplateId>('company-manufacturing')
/** Exact rendering version recorded in generated source. */
export const companyTemplateVersion = '3.0.0'
const parameters = z.object({ locale: z.enum(['en', 'zh-CN']).default('en'), translations: z.array(z.object({ locale: z.enum(['en', 'zh-CN']), content: siteCompanyContent }).strict()).max(1).default([]), content: siteCompanyContent, style: z.enum(['industrial', 'precision', 'international']), inquiryEndpoint: z.literal('local'), growth: siteGrowth.prefault({}), sourceDigest: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict()
const esc = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const assets = new URL('../templates/company/', import.meta.url)

function render(input: z.infer<typeof parameters>): SiteProject {
  const { content: company, style, inquiryEndpoint } = input
  const t = (key: string) => input.locale === 'zh-CN' ? companyZh[key] ?? key : key
  const nav = [[t("Products"), '/products/'], [t("Applications"), '/applications/'], [t("Qualifications"), '/quality/'], [t("Company"), '/about/'], [t("Contact"), '/contact/']]
  if (company.products.length) nav.splice(3, 0, [t("Buying guide"), '/buying-guide/'], [t("FAQ"), '/faq/'])
  if (company.pages.length) nav.push([t('Resources'), '/resources/'])
  if (input.growth.agent) nav.push([t("Ask AI"), '/consult/'])
  const link = (label: string, path: string) => `<a class="button" href="${path}">${label} <span aria-hidden="true">↗</span></a>`
  const cards = company.products.map(product => `<article class="product-card"><p class="eyebrow">${t("PRODUCT")}</p><h3><a href="/products/${product.slug}/">${esc(product.name)}</a></h3><p>${esc(product.description)}</p>${link(t("View specifications"), `/products/${product.slug}/`)}</article>`).join('')
  const list = (values: string[]) => `<ul>${values.map(value => `<li>${esc(value)}</li>`).join('')}</ul>`
  const page = (title: string, body: string) => `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | ${esc(company.name)}</title><meta name="description" content="${esc(company.description)}"><link rel="stylesheet" href="/company.css"><script defer src="/company.js"></script></head><body class="theme-${style}"><a class="skip" href="#main">${t("Skip to content")}</a><header><div class="wrap header"><a class="brand" href="/">${esc(company.name)}</a><button class="menu-toggle" aria-expanded="false" aria-controls="navigation">${t("Menu")}</button><nav id="navigation">${nav.map(([label, path]) => `<a href="${path}">${label}</a>`).join('')}</nav></div></header><main id="main">${body}</main><section class="cta"><div class="wrap"><h2>${t("Tell us what your project needs.")}</h2>${link(t("Send an inquiry"), '/contact/')}</div></section><footer class="wrap"><strong>${esc(company.name)}</strong><p>${esc(company.business)}</p><a href="/privacy/">${t("Privacy & inquiries")}</a></footer></body></html>`
  const heading = (label: string, title: string, description = '') => `<section class="page-heading wrap"><p class="eyebrow">${label}</p><h1>${esc(title)}</h1>${description ? `<p class="lead">${esc(description)}</p>` : ''}</section>`
  const contact = `${heading(t("LET’S TALK"), t("Discuss your requirements"))}<section class="wrap columns"><aside><h2>${esc(company.name)}</h2>${company.email ? `<p><a href="mailto:${esc(company.email)}">${esc(company.email)}</a></p>` : ''}<p>${esc(company.phone)}</p><p>${esc(company.address)}</p></aside>${inquiryEndpoint ? `<form id="company-inquiry" data-endpoint="${esc(inquiryEndpoint)}"><label>${t("Name")}<input name="name" required maxlength="160" autocomplete="name"></label><label>${t("Email")}<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>${t("Company")}<input name="company" maxlength="200" autocomplete="organization"></label><label>${t("Product")}<select name="product"><option value="">${t("General inquiry")}</option>${company.products.map(p => `<option data-product-slug="${p.slug}" value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}</select></label><label>${t("Requirements")}<textarea name="message" required minlength="10" maxlength="5000" rows="6"></textarea></label><label class="trap" aria-hidden="true">${t("Website")}<input name="website" tabindex="-1" autocomplete="off"></label><label class="consent"><input type="checkbox" name="consent" required> ${t("I agree that my details will be stored so the company can respond.")} <a href="/privacy/">${t("Privacy information")}</a></label><button type="submit">${t("Send inquiry")}</button><p role="status" id="inquiry-status" aria-live="polite"></p><noscript>${t("Enable JavaScript to submit your inquiry.")}</noscript></form>` : `<p>${t("Online inquiries are not configured. Please use the company contact details.")}</p>`}</section>`
  const files: { path: string; encoding: 'utf8'; content: string }[] = [
    { path: 'index.html', encoding: 'utf8', content: page(t("Home"), `<section class="hero"><div class="wrap hero-grid"><div><p class="eyebrow">${esc(company.business || company.name)}</p><h1>${esc(company.name)}</h1><p class="lead">${esc(company.description)}</p><div class="actions">${link(t("Explore products"), '/products/')}${link(t("Discuss your project"), '/contact/')}</div></div><div class="hero-graphic" aria-hidden="true"><span></span><span></span><span></span></div></div></section><section class="wrap section"><p class="eyebrow">${t("PRODUCT PORTFOLIO")}</p><h2>${t("Explore our products")}</h2><div class="product-grid">${cards || `<p>${t("Contact us for product information.")}</p>`}</div></section><section class="company-band"><div class="wrap"><p class="eyebrow">${t("COMPANY")}</p><h2>${esc(company.name)}</h2><p>${esc(company.description)}</p>${link(t("About our business"), '/about/')}</div></section>`) },
    { path: 'products/index.html', encoding: 'utf8', content: page(t("Products"), `${heading(t("PRODUCT PORTFOLIO"), t("Products"))}<section class="wrap section product-grid">${cards || `<p>${t("Contact us for product information.")}</p>`}</section>`) },
    { path: 'applications/index.html', encoding: 'utf8', content: page(t("Applications"), `${heading(t("APPLICATIONS"), t("Products for your application"))}<section class="wrap section">${company.products.filter(p => p.applications.length).map(p => `<article><h2><a href="/products/${p.slug}/">${esc(p.name)}</a></h2>${list(p.applications)}</article>`).join('') || `<p>${t("Contact us to discuss suitability for your application.")}</p>`}</section>`) },
    { path: 'quality/index.html', encoding: 'utf8', content: page(t("Qualifications"), `${heading(t("QUALIFICATIONS"), t("Company qualifications"))}<section class="wrap section">${company.qualifications.length ? list(company.qualifications) : `<p>${t("Contact us for qualification and documentation requests.")}</p>`}</section>`) },
    { path: 'about/index.html', encoding: 'utf8', content: page(t("Company"), `${heading(t("COMPANY"), company.name, company.description)}<section class="wrap section"><h2>${t("Our business")}</h2><p>${esc(company.business)}</p></section>`) },
    { path: 'contact/index.html', encoding: 'utf8', content: page(t("Contact"), contact) },
    { path: 'privacy/index.html', encoding: 'utf8', content: page(t("Privacy"), `${heading(t("PRIVACY"), t("Inquiry information"))}<section class="wrap section"><p>${input.locale === 'zh-CN' ? `本表单将姓名、邮箱、公司、所选产品和需求提交给${esc(company.name)}用于回复咨询，并保存在企业私有工作区。收到回执不代表已发送邮件。` : `Submitting this form sends your name, email, company, selected product and requirements to ${esc(company.name)} for responding to your request. The company stores the inquiry in its private workspace. No email delivery is implied by the receipt.`}</p><p>${input.locale === 'zh-CN' ? `请勿提交密码或敏感文件。如需访问或删除个人信息，请联系${esc(company.email || company.name)}。保存期限请与企业确认。` : `Do not include passwords or sensitive documents. Contact ${esc(company.email || company.name)} to request access or deletion. Contact details and retention practices should be confirmed with the company.`}</p></section>`) },
    ...company.products.map(product => ({ path: `products/${product.slug}/index.html`, encoding: 'utf8' as const, content: page(product.name, `${heading(t("PRODUCT"), product.name, product.description)}<section class="wrap section"><h2>${t("Specifications")}</h2><dl>${product.specifications.map(fact => `<dt>${esc(fact.name)}</dt><dd>${esc(fact.value)}</dd>`).join('')}</dl><h2>${t("Applications")}</h2>${list(product.applications)}${link(t("Inquire about this product"), `/contact/#${product.slug}`)}</section>`) })),
    { path: 'company.css', encoding: 'utf8', content: readFileSync(new URL('company.css', assets), 'utf8') },
    { path: 'company.js', encoding: 'utf8', content: readFileSync(new URL('company.js', assets), 'utf8') },
  ]
  const questions = company.products.flatMap(product => [
    { question: input.locale === 'zh-CN' ? `${product.name}是什么？` : `What is ${product.name}?`, answer: product.description },
    ...(product.applications.length ? [{ question: input.locale === 'zh-CN' ? `${product.name}适用于哪些应用？` : `Where is ${product.name} used?`, answer: product.applications.join('; ') }] : []),
    ...(product.limitations.length ? [{ question: input.locale === 'zh-CN' ? `${product.name}有哪些限制？` : `What are the limitations of ${product.name}?`, answer: product.limitations.join('; ') }] : []),
  ])
  if (questions.length) files.push({ path: 'faq/index.html', encoding: 'utf8', content: page(t("Product questions"), `${heading(t("BUYER QUESTIONS"), t("Product questions"))}<section class="wrap section">${questions.map(item => `<article><h2>${esc(item.question)}</h2><p>${esc(item.answer)}</p></article>`).join('')}</section>`) })
  if (company.products.length) files.push({ path: 'buying-guide/index.html', encoding: 'utf8', content: page(t("Product selection guide"), `${heading(t("BUYING GUIDE"), t("Compare requirements with published specifications"))}<section class="wrap section">${company.products.map(product => `<article><h2><a href="/products/${product.slug}/">${esc(product.name)}</a></h2><p>${esc(product.description)}</p>${product.customers.length ? `<h3>${t("Intended customers")}</h3>${list(product.customers)}` : ''}${product.differences.length ? `<h3>${t("Product characteristics")}</h3>${list(product.differences)}` : ''}${product.limitations.length ? `<h3>${t("Limitations")}</h3>${list(product.limitations)}` : ''}</article>`).join('')}<p>${t("Include your application, required specifications and quantity in your inquiry. Price, lead time and suitability require confirmation from the company.")}</p></section>`) })
  if (input.growth.agent) files.push({ path: 'consult/index.html', encoding: 'utf8', content: page(t("Product consultation"), `${heading(t("PRODUCT CONSULTATION"), t("Ask about our products"), t("Answers use the published company information. Confirm specifications and commercial terms with the company."))}<section class="wrap section"><form id="site-consultation"><label>${t("Your question")}<textarea name="question" required maxlength="2000" rows="3"></textarea></label><p>${t("Questions and answers are stored privately by the company to provide this consultation. Do not include sensitive information.")}</p><button type="submit">${t("Ask a question")}</button><p id="consultation-status" role="status" aria-live="polite"></p></form><div id="consultation-answers"></div><button type="button" id="consultation-inquiry">${t("Prepare an inquiry from this conversation")}</button>${contact}</section>`) })
  for (const item of company.pages) files.push({ path: `resources/${item.kind}/${item.slug}/index.html`, encoding: 'utf8', content: page(item.title, `${heading(t(({ industry: 'Industry', solution: 'Solution', case: 'Case study', comparison: 'Comparison' })[item.kind]), item.title, item.summary)}<section class="wrap section">${item.sections.map(section => `<article><h2>${esc(section.title)}</h2><p>${esc(section.body)}</p></article>`).join('')}${item.sources.length ? `<h2>${t('Public references')}</h2>${item.sources.map(source => `<p><a href="${esc(source.url)}" rel="noopener noreferrer">${esc(source.title)}</a></p>`).join('')}` : ''}</section>`) })
  if (company.pages.length) files.push({ path: 'resources/index.html', encoding: 'utf8', content: page(t('Resources'), `${heading(t('Resources'), t('Resources'))}<section class="wrap section">${company.pages.map(item => `<article><h2><a href="/resources/${item.kind}/${item.slug}/">${esc(item.title)}</a></h2><p>${esc(item.summary)}</p></article>`).join('')}</section>`) })
  const organization = { '@type': 'Organization', '@id': '/#organization', name: company.name, description: company.description, url: '/', ...(company.email ? { email: company.email } : {}) }
  for (const file of files.filter(file => file.path.endsWith('.html'))) {
    const product = company.products.find(item => file.path === `products/${item.slug}/index.html`)
    const graph: unknown[] = [organization, { '@type': 'WebSite', '@id': '/#website', name: company.name, url: '/', publisher: { '@id': '/#organization' } }]
    const path = '/' + file.path.replace(/index\.html$/, '')
    graph.push({ '@type': 'WebPage', '@id': `${path}#page`, url: path, isPartOf: { '@id': '/#website' }, about: { '@id': '/#organization' } })
    if (file.path === 'faq/index.html') graph.push({ '@type': 'FAQPage', mainEntity: questions.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) })
    if (product) file.content = file.content.replace(`<meta name="description" content="${esc(company.description)}">`, `<meta name="description" content="${esc(product.description)}">`)
    const editorial = company.pages.find(item => file.path === `resources/${item.kind}/${item.slug}/index.html`)
    if (editorial) { graph.push({ '@type': 'Article', headline: editorial.title, description: editorial.summary, publisher: { '@id': '/#organization' }, citation: editorial.sources.map(source => source.url) }); file.content = file.content.replace(`<meta name="description" content="${esc(company.description)}">`, `<meta name="description" content="${esc(editorial.summary)}">`) }
    if (product) graph.push({ '@type': t("Product"), '@id': `/products/${product.slug}/#product`, url: `/products/${product.slug}/`, name: product.name, description: product.description, manufacturer: { '@id': '/#organization' }, additionalProperty: product.specifications.map(fact => ({ '@type': 'PropertyValue', name: fact.name, value: fact.value })) })
    const structured = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c')
    file.content = file.content.replace('</head>', `<script type="application/ld+json">${structured}</script></head>`)
    if (product) file.content = file.content.replace('</main>', `${product.limitations.length ? `<section class="wrap"><h2>${t("Limitations")}</h2>${list(product.limitations)}</section>` : ''}${product.evidence.length ? `<section class="wrap"><h2>${t("Public references")}</h2>${product.evidence.map(source => `<p>${esc(source.title)}: ${esc(source.citation)}${source.url ? ` <a href="${esc(source.url)}" rel="noopener noreferrer">${t("Source")}</a>` : ''}</p>`).join('')}</section>` : ''}</main>`)
    if (input.growth.analytics) file.content = file.content.replace('</main>', `<section class="wrap"><p>${t("This website uses self-hosted Umami to measure visits and interactions. Contact the company for its data retention and privacy practices.")}</p></section></main>`)
  }
  files.push({ path: 'company.public.json', encoding: 'utf8', content: JSON.stringify(company) }, { path: 'site.growth.json', encoding: 'utf8', content: JSON.stringify(input.growth) })
  return { framework: 'static', files }
}

/** Parameterized provider shared by reviewed company imports and ordinary template consumers. */
export const companyTemplateProvider: SiteTemplateProvider = {
  descriptor: { id: companyTemplateId, version: companyTemplateVersion, name: 'Company manufacturing website', description: 'Render explicit company content and public product facts. The local inquiry receiver is available only while this website is published.', parameters: z.toJSONSchema(parameters) },
  resolve: input => {
    const value = parameters.parse(input)
    const variants = [{ locale: value.locale, content: value.content }, ...value.translations]
    if (new Set(variants.map(item => item.locale)).size !== variants.length) throw new Error('Duplicate website language')
    for (const variant of variants) {
      const paths = [...variant.content.products.map(item => 'products/' + item.slug), ...variant.content.pages.map(item => item.kind + '/' + item.slug)]
      if (new Set(paths).size !== paths.length) throw new Error('Duplicate public content path')
    }
    return JSON.parse(JSON.stringify(value)) as SiteTemplateParameters
  },
  render: input => {
    const value = input as z.infer<typeof parameters>
    const variants = [{ locale: value.locale, content: value.content }, ...value.translations]
    return localizeCompanyProject(variants.map((variant, index) => ({ locale: variant.locale, prefix: index ? variant.locale + '/' : '', project: render({ ...value, ...variant }) })))
  },
}
