/** Local navigation, product filtering and an explicitly unsent inquiry draft. */
const toggle = document.querySelector('.menu-toggle')
const navigation = document.querySelector('#primary-nav')
toggle?.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true'
  toggle.setAttribute('aria-expanded', String(open))
  navigation?.classList.toggle('open', open)
})
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || toggle?.getAttribute('aria-expanded') !== 'true') return
  toggle.setAttribute('aria-expanded', 'false')
  navigation?.classList.remove('open')
  toggle.focus()
})
document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)))
    document.querySelectorAll('.catalog-grid .product-card').forEach(card => {
      card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter
    })
  })
})
const form = document.querySelector('#inquiry-form')
if (form) {
  const selectProduct = () => {
    const select = form.elements.namedItem('product')
    const option = Array.from(select.options).find(item => item.dataset.productSlug === location.hash.slice(1))
    if (option) select.value = option.value
  }
  selectProduct()
  window.addEventListener('hashchange', selectProduct)
  form.addEventListener('submit', event => {
    event.preventDefault()
    const fields = new FormData(form)
    const draft = document.querySelector('#inquiry-draft')
    draft.value = ['INQUIRY DRAFT — NOT SENT', '', ...['name', 'email', 'company', 'product', 'quantity', 'requirements'].map(key => `${key[0].toUpperCase() + key.slice(1)}: ${fields.get(key) || 'Not specified'}`)].join('\n')
    document.querySelector('#inquiry-output').hidden = false
    draft.focus()
  })
}
