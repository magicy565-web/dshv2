/** Company websites render only explicit reviewed facts; absent evidence produces no invented claims. */
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SiteTemplateId, SiteTemplateProvider } from '../../../packages/site/site/src/template-types.ts'
import type { SiteProject } from '../../../packages/site/site/src/types.ts'
import { siteCompanyContent } from './site-company-schema.ts'

/** Installed provider id for real company content, independent of the illustrative starter. */
export const companyTemplateId = brandString<SiteTemplateId>('company-manufacturing')
/** Exact rendering version recorded in generated source. */
export const companyTemplateVersion = '1.0.0'
const parameters = z.object({ content: siteCompanyContent, style: z.enum(['industrial', 'precision', 'international']), inquiryEndpoint: z.literal('local') }).strict()
const esc = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const assets = new URL('../templates/company/', import.meta.url)

function render(input: z.infer<typeof parameters>): SiteProject {
  const { content: company, style, inquiryEndpoint } = input
  const nav = [['Products', '/products/'], ['Applications', '/applications/'], ['Qualifications', '/quality/'], ['Company', '/about/'], ['Contact', '/contact/']]
  const link = (label: string, path: string) => `<a class="button" href="${path}">${label} <span aria-hidden="true">↗</span></a>`
  const cards = company.products.map(product => `<article class="product-card"><p class="eyebrow">PRODUCT</p><h3><a href="/products/${product.slug}/">${esc(product.name)}</a></h3><p>${esc(product.description)}</p>${link('View specifications', `/products/${product.slug}/`)}</article>`).join('')
  const list = (values: string[]) => `<ul>${values.map(value => `<li>${esc(value)}</li>`).join('')}</ul>`
  const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | ${esc(company.name)}</title><meta name="description" content="${esc(company.description)}"><link rel="stylesheet" href="/company.css"><script defer src="/company.js"></script></head><body class="theme-${style}"><a class="skip" href="#main">Skip to content</a><header><div class="wrap header"><a class="brand" href="/">${esc(company.name)}</a><button class="menu-toggle" aria-expanded="false" aria-controls="navigation">Menu</button><nav id="navigation">${nav.map(([label, path]) => `<a href="${path}">${label}</a>`).join('')}</nav></div></header><main id="main">${body}</main><section class="cta"><div class="wrap"><h2>Tell us what your project needs.</h2>${link('Send an inquiry', '/contact/')}</div></section><footer class="wrap"><strong>${esc(company.name)}</strong><p>${esc(company.business)}</p><a href="/privacy/">Privacy & inquiries</a></footer></body></html>`
  const heading = (label: string, title: string, description = '') => `<section class="page-heading wrap"><p class="eyebrow">${label}</p><h1>${esc(title)}</h1>${description ? `<p class="lead">${esc(description)}</p>` : ''}</section>`
  const contact = `${heading('LET’S TALK', 'Discuss your requirements')}<section class="wrap columns"><aside><h2>${esc(company.name)}</h2>${company.email ? `<p><a href="mailto:${esc(company.email)}">${esc(company.email)}</a></p>` : ''}<p>${esc(company.phone)}</p><p>${esc(company.address)}</p></aside>${inquiryEndpoint ? `<form id="company-inquiry" data-endpoint="${esc(inquiryEndpoint)}"><label>Name<input name="name" required maxlength="160" autocomplete="name"></label><label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Company<input name="company" maxlength="200" autocomplete="organization"></label><label>Product<select name="product"><option value="">General inquiry</option>${company.products.map(p => `<option data-product-slug="${p.slug}" value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}</select></label><label>Requirements<textarea name="message" required minlength="10" maxlength="5000" rows="6"></textarea></label><label class="trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><label class="consent"><input type="checkbox" name="consent" required> I agree that my details will be stored so the company can respond. <a href="/privacy/">Privacy information</a></label><button type="submit">Send inquiry</button><p role="status" id="inquiry-status" aria-live="polite"></p><noscript>Enable JavaScript to submit your inquiry.</noscript></form>` : '<p>Online inquiries are not configured. Please use the company contact details.</p>'}</section>`
  const files: SiteProject['files'] = [
    { path: 'index.html', encoding: 'utf8', content: page('Home', `<section class="hero"><div class="wrap hero-grid"><div><p class="eyebrow">${esc(company.business || company.name)}</p><h1>${esc(company.name)}</h1><p class="lead">${esc(company.description)}</p><div class="actions">${link('Explore products', '/products/')}${link('Discuss your project', '/contact/')}</div></div><div class="hero-graphic" aria-hidden="true"><span></span><span></span><span></span></div></div></section><section class="wrap section"><p class="eyebrow">PRODUCT PORTFOLIO</p><h2>Explore our products</h2><div class="product-grid">${cards || '<p>Contact us for product information.</p>'}</div></section><section class="company-band"><div class="wrap"><p class="eyebrow">COMPANY</p><h2>${esc(company.name)}</h2><p>${esc(company.description)}</p>${link('About our business', '/about/')}</div></section>`) },
    { path: 'products/index.html', encoding: 'utf8', content: page('Products', `${heading('PRODUCT PORTFOLIO', 'Products')}<section class="wrap section product-grid">${cards || '<p>Contact us for product information.</p>'}</section>`) },
    { path: 'applications/index.html', encoding: 'utf8', content: page('Applications', `${heading('APPLICATIONS', 'Products for your application')}<section class="wrap section">${company.products.filter(p => p.applications.length).map(p => `<article><h2><a href="/products/${p.slug}/">${esc(p.name)}</a></h2>${list(p.applications)}</article>`).join('') || '<p>Contact us to discuss suitability for your application.</p>'}</section>`) },
    { path: 'quality/index.html', encoding: 'utf8', content: page('Qualifications', `${heading('QUALIFICATIONS', 'Company qualifications')}<section class="wrap section">${company.qualifications.length ? list(company.qualifications) : '<p>Contact us for qualification and documentation requests.</p>'}</section>`) },
    { path: 'about/index.html', encoding: 'utf8', content: page('Company', `${heading('COMPANY', company.name, company.description)}<section class="wrap section"><h2>Our business</h2><p>${esc(company.business)}</p></section>`) },
    { path: 'contact/index.html', encoding: 'utf8', content: page('Contact', contact) },
    { path: 'privacy/index.html', encoding: 'utf8', content: page('Privacy', `${heading('PRIVACY', 'Inquiry information')}<section class="wrap section"><p>Submitting this form sends your name, email, company, selected product and requirements to ${esc(company.name)} for responding to your request. The company stores the inquiry in its private workspace. No email delivery is implied by the receipt.</p><p>Do not include passwords or sensitive documents. Contact ${esc(company.email || company.name)} to request access or deletion. Contact details and retention practices should be confirmed with the company.</p></section>`) },
    ...company.products.map(product => ({ path: `products/${product.slug}/index.html`, encoding: 'utf8' as const, content: page(product.name, `${heading('PRODUCT', product.name, product.description)}<section class="wrap section"><h2>Specifications</h2><dl>${product.specifications.map(fact => `<dt>${esc(fact.name)}</dt><dd>${esc(fact.value)}</dd>`).join('')}</dl><h2>Applications</h2>${list(product.applications)}${link('Inquire about this product', `/contact/#${product.slug}`)}</section>`) })),
    { path: 'company.css', encoding: 'utf8', content: readFileSync(new URL('company.css', assets), 'utf8') },
    { path: 'company.js', encoding: 'utf8', content: readFileSync(new URL('company.js', assets), 'utf8') },
  ]
  return { framework: 'static', files }
}

/** Parameterized provider shared by reviewed company imports and ordinary template consumers. */
export const companyTemplateProvider: SiteTemplateProvider = {
  descriptor: { id: companyTemplateId, version: companyTemplateVersion, name: 'Company manufacturing website', description: 'Render explicit company content and public product facts. The local inquiry receiver is available only while this website is published.', parameters: z.toJSONSchema(parameters) },
  resolve: input => parameters.parse(input),
  render: input => render(input as z.infer<typeof parameters>),
}
