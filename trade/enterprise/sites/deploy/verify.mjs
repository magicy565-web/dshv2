/** Read-only public deployment checks, plus an explicitly requested live model call. */
import assert from 'node:assert/strict'

const [input, ...options] = process.argv.slice(2)
const base = new URL(input)
assert.ok(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password && /^\/sites-live\/[a-f0-9-]{36}\/$/.test(base.pathname), 'Supply the published site directory URL')
const request = (path, init = {}) => fetch(new URL(path, base), { ...init, redirect: 'error', signal: AbortSignal.timeout(180000) })
const home = await request('')
assert.equal(home.status, 200, 'Published homepage')
assert.match(home.headers.get('content-security-policy') ?? '', /sandbox allow-scripts allow-forms;/)
const html = await home.text()
assert.ok(html.includes(`rel="canonical" href="${base.href}"`), 'Exact canonical URL')
assert.match(html, /application\/ld\+json/, 'Structured data')
for (const path of ['sitemap.xml', 'robots.txt', 'llms.txt', 'contact/']) assert.equal((await request(path)).status, 200, path)
for (const path of ['company.public.json', 'site.template.json', 'site.growth.json']) assert.equal((await request(path)).status, 404, 'Private source is hidden')
console.log('Public pages, discovery, canonical identity and source isolation: passed')
if (options.includes('--consult')) {
  const started = Date.now()
  const response = await request('_consult', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'What products do you supply, and which details require confirmation?' }) })
  assert.equal(response.status, 200, 'Live configured model response')
  const result = await response.json(); assert.ok(typeof result.answer === 'string' && result.answer.trim())
  console.log(`Live model returned ${result.answer.length} characters in ${Date.now() - started} ms. Review the answer in the private Session log; transport success does not establish answer quality.`)
}
