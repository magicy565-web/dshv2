import { describe, expect, it } from 'vitest'
import { assertValidSiteChangeSet, validateSiteChangeSet } from '../src/index.ts'

describe('site change set validation', () => {
  it('accepts controlled pages, colors, and unique product order', () => {
    expect(validateSiteChangeSet({
      pages: [{ id: 'home', kind: 'home', path: '/', title: 'Store' }],
      theme: { colors: { primary: '#112233' }, fonts: {}, layout: {} },
      productOrder: ['product-1' as never],
    })).toEqual([])
  })

  it('reports unsafe paths, duplicate ids, colors, and products', () => {
    const errors = validateSiteChangeSet({
      pages: [
        { id: 'home', kind: 'home', path: '/..', title: 'A' },
        { id: 'home', kind: 'home', path: 'unsafe', title: 'B' },
      ],
      theme: { colors: { primary: 'red' }, fonts: {}, layout: {} },
      productOrder: ['p' as never, 'p' as never],
    })
    expect(errors).toHaveLength(5)
    expect(() =>{  assertValidSiteChangeSet({ pages: [{ id: 'x', kind: 'home', path: 'x', title: 'x' }] }) })
      .toThrow(/invalid site change set/)
  })

  it('rejects empty page identity and titles', () => {
    expect(validateSiteChangeSet({ pages: [{ id: ' ', kind: 'home', path: '/x', title: '' }] }))
      .toEqual(['page id must not be empty', "page ' ' title must not be empty"])
  })

  it('rejects duplicate URLs, query fragments, and control characters', () => {
    const errors = validateSiteChangeSet({ pages: [
      { id: 'a', kind: 'home', path: '/same', title: 'A' },
      { id: 'b', kind: 'campaign', path: '/same', title: 'B' },
      { id: 'c', kind: 'campaign', path: '/bad?x=1', title: 'C' },
      { id: 'd', kind: 'campaign', path: '/bad#part', title: 'D' },
      { id: 'e', kind: 'campaign', path: '/bad\u0000', title: 'E' },
    ] })
    expect(errors).toEqual(expect.arrayContaining([
      "pages contains duplicate path '/same'",
      "page 'c' path cannot contain query or fragment delimiters",
      "page 'd' path cannot contain query or fragment delimiters",
      "page 'e' path cannot contain control characters",
    ]))
  })
})
