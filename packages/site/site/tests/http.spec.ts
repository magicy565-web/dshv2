/** Editor requests authenticate before exposing any site state. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { TenantId } from '../../../shopify/shopify/src/types.ts'
import { InMemorySiteService } from '../src/memory.ts'
import { createSiteHttpHandler } from '../src/http.ts'

function fixture() {
  const sites = new InMemorySiteService(new Context())
  const handler = createSiteHttpHandler(sites, {
    authenticate: async request => request.headers.get('authorization') === 'owner' ? TenantId('owner') : undefined,
    authorizeConnection: async (_tenant, connection) => { if (connection !== 'store') throw new Error('connection denied') },
    publicOrigin: 'https://store.test', maxBodyBytes: 1024,
  })
  const request = (route: string, data?: unknown, auth = 'owner') => handler(new Request(`https://app.test${route}`, {
    method: data === undefined ? 'GET' : 'POST', headers: { authorization: auth, 'content-type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  }), route.split('?')[0]!)
  return { sites, request, handler }
}

describe('site editor HTTP', () => {
  it('creates and restores a site without commerce while still authorizing supplied connections', async () => {
    const { sites, request } = fixture()
    const response = await request('/sites', { name: 'Independent studio' })
    expect(response.status).toBe(201)
    const site = await response.json()
    expect(site.connectionId).toBeUndefined()
    const restored = new InMemorySiteService(new Context())
    restored.restore(sites.snapshot())
    expect(restored.list(TenantId('owner'))).toEqual([site])
    await expect(request('/sites', { name: 'Other', connectionId: 'foreign' })).rejects.toThrow('connection denied')
    expect((await request('/sites', { name: 'Other', connectionId: null })).status).toBe(400)
  })
  it('resolves routes and methods before parsing action parameters or bodies', async () => {
    const { request, handler } = fixture()
    const site = await (await request('/sites', { name: 'Store', connectionId: 'store' })).json()
    for (const [action, method, status] of [
      ['unknown', 'GET', 404], ['unknown', 'POST', 404],
      ['rollback', 'GET', 405], ['cancel', 'GET', 405],
      ['preview', 'POST', 405], ['jobs', 'POST', 405],
      ['', 'POST', 405], ['revisions', 'DELETE', 405],
    ] as const) {
      const route = `/sites/${site.id}/${action}`
      const response = await handler(new Request(`https://app.test${route}`, {
        method, headers: { authorization: 'owner' },
      }), route)
      expect(response.status).toBe(status)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('returns a missing-page response and previews inherited pages', async () => {
    const { request } = fixture()
    const site = await (await request('/sites', { name: 'Store', connectionId: 'store' })).json()
    const path = `/sites/${site.id}`
    const first = await (await request(`${path}/revisions`, { changeSet: {
      pages: [{ id: 'home', kind: 'home', path: '/', title: 'Home' }],
    } })).json()
    const inherited = await (await request(`${path}/revisions`, { changeSet: { baseRevisionId: first.id } })).json()
    expect((await request(`${path}/preview?revisionId=${inherited.id}&pageId=home`)).status).toBe(200)
    const missing = await request(`${path}/preview?revisionId=${inherited.id}&pageId=missing`)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'page not found' })
    expect((await request(`${path}/preview?revisionId=${inherited.id}`)).status).toBe(400)
    const cleared = await (await request(`${path}/revisions`, { changeSet: { baseRevisionId: inherited.id, pages: [] } })).json()
    expect((await request(`${path}/preview?revisionId=${cleared.id}&pageId=home`)).status).toBe(404)
  })

  it('queues publication for an existing revision and rejects stale expectations', async () => {
    const { request } = fixture()
    const site = await (await request('/sites', { name: 'Store', connectionId: 'store' })).json()
    const path = `/sites/${site.id}`
    const revision = await (await request(`${path}/revisions`, { changeSet: {} })).json()
    const queued = await request(`${path}/publish`, { revisionId: revision.id, expectedRevisionId: revision.id })
    expect(queued.status).toBe(202)
    expect((await queued.json()).revisionId).toBe(revision.id)
    const stale = await request(`${path}/publish`, { revisionId: revision.id, expectedRevisionId: 'stale' })
    expect(stale.status).toBe(409)
    const missing = await request(`${path}/publish`, { revisionId: 'missing' })
    expect(missing.status).toBe(404)
  })

  it('creates, edits, compares and previews a site while enforcing the observed revision', async () => {
    const { request } = fixture()
    const created = await request('/sites', { name: 'Store', connectionId: 'store', tenantId: 'forged' })
    expect(created.status).toBe(201)
    const site = await created.json()
    expect(site.tenantId).toBe('owner')
    const path = `/sites/${site.id}`
    const firstResponse = await request(`${path}/revisions`, { changeSet: { pages: [{ id: 'home', kind: 'home', path: '/', title: 'Home' }] } })
    expect(firstResponse.status).toBe(201)
    const first = await firstResponse.json()
    expect((await request(`${path}/revisions`, { changeSet: {} })).status).toBe(409)
    const secondResponse = await request(`${path}/revisions`, { changeSet: { baseRevisionId: first.id, pages: [{ id: 'home', kind: 'home', path: '/', title: 'Updated' }] } })
    const second = await secondResponse.json()
    const diff = await (await request(`${path}/diff?revisionId=${second.id}&baseRevisionId=${first.id}`)).json()
    expect(diff.changed[0].after.title).toBe('Updated')
    const preview = await request(`${path}/preview?revisionId=${second.id}&pageId=home`)
    expect(preview.status).toBe(200)
    expect(preview.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(preview.headers.get('content-security-policy')).toContain('sandbox')
    expect(await preview.text()).toContain('<h1>Updated</h1>')
    const rolled = await request(`${path}/rollback`, { revisionId: first.id, expectedRevisionId: second.id })
    expect(rolled.status).toBe(201)
    expect((await rolled.json()).source).toBe('rollback')
  })

  it('rejects unauthenticated access, foreign sites, malformed edits and oversized input', async () => {
    const { request } = fixture()
    expect((await request('/sites', undefined, '')).status).toBe(401)
    expect((await request('/sites/missing')).status).toBe(404)
    const site = await (await request('/sites', { name: 'Store', connectionId: 'store' })).json()
    expect((await request(`/sites/${site.id}/revisions`, { changeSet: { pages: 'invalid' } })).status).toBe(400)
    expect((await request('/sites', { name: 'x'.repeat(2000), connectionId: 'store' })).status).toBe(413)
    await expect(request('/sites', { name: 'Store', connectionId: 'foreign' })).rejects.toThrow('connection denied')
  })
})
