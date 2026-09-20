'use client'
/** Existing store selection with server-owned publication names and no credential fields. */
import { useState } from 'react'
import { t, statuses } from '../src/copy.ts'
import { publicationList, storeList } from '../src/store-wire.ts'
import type { StoreBinding } from '../src/store-wire.ts'
import type { z } from 'zod'

/** Select an enterprise-owned store for future launches.
 * @param props - Current binding and authenticated request function.
 * @returns Store and publication selection controls.
 */
export function StoreSettings({ selected, run }: { selected: StoreBinding | null; run: (path: string, body: object) => Promise<unknown> }) {
  const [stores, setStores] = useState<z.infer<typeof storeList> | null>(null), [publications, setPublications] = useState<z.infer<typeof publicationList> | null>(null)
  const [connection, setConnection] = useState(''), [publication, setPublication] = useState(''), [busy, setBusy] = useState(false)
  return <section className="card"><h2>{t('existingStores')}</h2><p>{t('storeHint')}</p>{selected && <p>{t('selectedStore')}: {selected.domain} · {selected.publicationName}</p>}
    <button disabled={busy} onClick={async () => { setBusy(true); try { const result = await run('shopify/stores', {}); if (result) { setStores(storeList.parse(result)); setConnection(''); setPublication(''); setPublications(null) } } finally { setBusy(false) } }}>{t('loadStores')}</button>
    {stores?.length === 0 && <p>{t('noStores')}</p>}
    {stores && stores.length > 0 && <><label>{t('chooseStore')}<select value={connection} disabled={busy} onChange={async e => { const key = e.target.value; setConnection(key); setPublication(''); setPublications(null); if (!key) return; setBusy(true); try { const result = await run('shopify/publications', { connectionId: key }); if (result) setPublications(publicationList.parse(result)) } finally { setBusy(false) } }}><option value="">{t('chooseStore')}</option>{stores.map(s => <option key={s.connectionId} value={s.connectionId} disabled={s.status !== 'connected' || !s.credentialAvailable}>{s.domain} · {statuses[s.status] ?? s.status}</option>)}</select></label>
    {connection && !stores.find(s => s.connectionId === connection)?.scopes.includes('write_publications') && <p>{t('storeScopes')}</p>}
    {publications && <><label>{t('choosePublication')}<select value={publication} onChange={e => setPublication(e.target.value)}><option value="">{t('choosePublication')}</option>{publications.nodes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{publications.hasMore && <p>{t('morePublications')}</p>}<button disabled={!publication || busy} onClick={async () => { setBusy(true); try { await run('shopify/select', { connectionId: connection, publicationId: publication }) } finally { setBusy(false) } }}>{t('selectStore')}</button></>}
    </>}
  </section>
}
