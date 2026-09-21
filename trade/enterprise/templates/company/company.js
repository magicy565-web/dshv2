/** Standalone navigation and durable inbox submission on the deployment's public Site routes. */
const publicRoute = location.pathname.match(/^\/sites-live\/([a-f0-9-]{36})\//)
const query = new URLSearchParams(location.search)
const referrerHost = (() => { try { return document.referrer ? new URL(document.referrer).hostname : '' } catch { return '' } })()
const attribution = {
  landingPath: (query.get('_site_landing') || location.pathname).slice(0, 500),
  referrerHost: (query.get('_site_referrer') || referrerHost).slice(0, 253),
  source: (query.get('utm_source') || '').slice(0, 100), medium: (query.get('utm_medium') || '').slice(0, 100), campaign: (query.get('utm_campaign') || '').slice(0, 100),
}
if (publicRoute) for (const link of document.querySelectorAll('a[href]')) {
  const url = new URL(link.href, location.href)
  if (url.origin !== location.origin || !url.pathname.startsWith(`/sites-live/${publicRoute[1]}/`)) continue
  for (const [key, value] of Object.entries({ _site_landing: attribution.landingPath, _site_referrer: attribution.referrerHost, utm_source: attribution.source, utm_medium: attribution.medium, utm_campaign: attribution.campaign })) if (value) url.searchParams.set(key, value)
  link.href = url.href
}
const track = name => { try { const pending = window.umami?.track(name); pending?.catch(() => {}) } catch { /* Optional analytics cannot block an inquiry. */ } }
const toggle = document.querySelector('.menu-toggle')
toggle?.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true'
  toggle.setAttribute('aria-expanded', String(open))
  document.querySelector('#navigation')?.classList.toggle('open', open)
})
const form = document.querySelector('#company-inquiry')
if (form) {
  const select = form.elements.namedItem('product')
  const option = Array.from(select.options).find(item => item.dataset.productSlug === location.hash.slice(1))
  if (option) select.value = option.value
  let pending = false
  let attempt
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (pending || !form.reportValidity()) return
    const status = document.querySelector('#inquiry-status')
    const route = location.pathname.match(/^\/sites-live\/([a-f0-9-]{36})\//)
    if (!route || location.protocol === 'file:') { status.textContent = (document.documentElement.lang === 'zh-CN' ? "请先发布此网站，再提交询盘。" : "Publish this website through Sites before submitting an inquiry."); return }
    const fields = new FormData(form)
    const data = Object.fromEntries(['name', 'email', 'company', 'product', 'message', 'website'].map(key => [key, fields.get(key) || '']))
    data.consent = fields.get('consent') === 'on'
    data.attribution = attribution
    const fingerprint = JSON.stringify(data)
    if (!attempt || attempt.fingerprint !== fingerprint) attempt = { fingerprint, requestId: Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('') }
    pending = true
    const button = form.querySelector('button[type=submit]')
    button.disabled = true
    status.textContent = (document.documentElement.lang === 'zh-CN' ? "正在提交…" : "Submitting…")
    try {
      const response = await fetch(`${location.origin}/sites-live/${route[1]}/_inquiries`, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...data, requestId: attempt.requestId }), signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error('submission')
      const receipt = await response.json()
      if (typeof receipt.id !== 'string' || receipt.status !== 'received') throw new Error('receipt')
      track('inquiry_received')
      status.textContent = document.documentElement.lang === 'zh-CN' ? `询盘已收到，编号：${receipt.id}。企业可在收件箱查看。` : `Inquiry received. Reference: ${receipt.id}. The company can view it in its inbox.`
      form.reset()
      attempt = undefined
    } catch {
      status.textContent = (document.documentElement.lang === 'zh-CN' ? "尚未确认回执。请保留表单内容重试，或直接联系企业。" : "Receipt could not be confirmed. Please retry without changing the form, or contact the company directly.")
    } finally { pending = false; button.disabled = false }
  })
}

const consultation = document.querySelector('#site-consultation')
if (consultation) {
  const history = []
  let busy = false
  consultation.addEventListener('submit', async event => {
    event.preventDefault()
    if (busy || !consultation.reportValidity()) return
    const status = document.querySelector('#consultation-status')
    if (!publicRoute) { status.textContent = (document.documentElement.lang === 'zh-CN' ? "请先发布网站，再使用产品咨询。" : "Publish this website before using product consultation."); return }
    const question = consultation.elements.namedItem('question').value.trim()
    const button = consultation.querySelector('button')
    busy = true; button.disabled = true; status.textContent = (document.documentElement.lang === 'zh-CN' ? "正在准备回答…" : "Preparing an answer…")
    track('consultation_started')
    try {
      const response = await fetch(`${location.origin}/sites-live/${publicRoute[1]}/_consult`, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, history: history.slice(-6) }) })
      if (!response.ok) throw new Error('consultation')
      const result = await response.json()
      if (typeof result.answer !== 'string') throw new Error('answer')
      history.push({ question, answer: result.answer.slice(0, 12000) })
      const article = document.createElement('article')
      const heading = document.createElement('h2'); heading.textContent = question
      const answer = document.createElement('p'); answer.textContent = result.answer; answer.style.whiteSpace = 'pre-wrap'
      article.append(heading, answer); document.querySelector('#consultation-answers').append(article)
      status.textContent = ''; consultation.reset(); track('consultation_answered')
    } catch { status.textContent = (document.documentElement.lang === 'zh-CN' ? "咨询暂不可用，请使用下方询盘表单。" : "Consultation is unavailable. Please use the inquiry form below.") }
    finally { busy = false; button.disabled = false }
  })
  document.querySelector('#consultation-inquiry').addEventListener('click', () => {
    const message = form?.elements.namedItem('message')
    if (!message || !history.length) return
    message.value = history.map(item => `Question: ${item.question}\nAnswer: ${item.answer}`).join('\n\n').slice(0, 5000)
    message.focus()
  })
}
