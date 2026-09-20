/** Standalone navigation and durable inbox submission on the deployment's public Site routes. */
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
    if (!route || location.protocol === 'file:') { status.textContent = 'Publish this website through Sites before submitting an inquiry.'; return }
    const fields = new FormData(form)
    const data = Object.fromEntries(['name', 'email', 'company', 'product', 'message', 'website'].map(key => [key, fields.get(key) || '']))
    data.consent = fields.get('consent') === 'on'
    const fingerprint = JSON.stringify(data)
    if (!attempt || attempt.fingerprint !== fingerprint) attempt = { fingerprint, requestId: Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('') }
    pending = true
    const button = form.querySelector('button[type=submit]')
    button.disabled = true
    status.textContent = 'Submitting…'
    try {
      const response = await fetch(`${location.origin}/sites-live/${route[1]}/_inquiries`, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...data, requestId: attempt.requestId }), signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error('submission')
      const receipt = await response.json()
      if (typeof receipt.id !== 'string' || receipt.status !== 'received') throw new Error('receipt')
      status.textContent = `Inquiry received. Reference: ${receipt.id}. The company can view it in its inbox.`
      form.reset()
      attempt = undefined
    } catch {
      status.textContent = 'Receipt could not be confirmed. Please retry without changing the form, or contact the company directly.'
    } finally { pending = false; button.disabled = false }
  })
}
