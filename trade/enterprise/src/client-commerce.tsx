/** Mount shared Commerce controls inside the existing authenticated enterprise panel. */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { zh } from './locales.ts'
import { CommerceWorkspace } from '../../commerce/app/workspace.tsx'
import type { EnterpriseKey } from './locales.ts'

/** Show the deployment link only when configured; opening carries source records through the Host.
 * @param props - Existing enterprise locale.
 * @returns Entry actions or the selected role's native business controls.
 */
export function CommerceEntry({ t, onActiveChange }: PropsLocale<'enterprise'> & { onActiveChange: (active: boolean) => void }) {
  const [activeRole, setActiveRole] = useState<'factory' | 'merchant' | null>(null), [attemptRole, setAttemptRole] = useState<'factory' | 'merchant'>('factory')
  const opening = useRef<AbortController | null>(null)
  useEffect(() => () => opening.current?.abort(), [])
  const [merchantEnabled, setMerchantEnabled] = useState(false)
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<EnterpriseKey | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/enterprise/commerce', { signal: controller.signal }).then(async r => {
      if (r.ok) { const value: unknown = await r.json(); if (!controller.signal.aborted) { setEnabled(typeof value === 'object' && value !== null && 'enabled' in value && value.enabled === true); setMerchantEnabled(typeof value === 'object' && value !== null && 'merchantEnabled' in value && value.merchantEnabled === true) } }
    }).catch(() => { /* An unavailable optional link leaves the existing workspace usable. */ })
    return () => controller.abort()
  }, [])
  if (!enabled) return null
  const open = async (refresh: boolean, role: 'factory' | 'merchant' = 'factory') => {
    setBusy(true); setError(null); setAttemptRole(role)
    opening.current?.abort()
    const controller = new AbortController(); opening.current = controller
    try {
      const response = await fetch('/api/enterprise/commerce', { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh, role, embedded: true }) })
      const value: unknown = await response.json()
      if (controller.signal.aborted) return
      if (!response.ok || typeof value !== 'object' || value === null || !('ready' in value) || value.ready !== true) {
        const key = typeof value === 'object' && value !== null && 'error' in value ? String(value.error) : ''
        setError(Object.hasOwn(zh, key) ? key as EnterpriseKey : 'commerceUnavailable'); return
      }
      setActiveRole(role); onActiveChange(true)
    } catch { if (!controller.signal.aborted) setError('commerceUnavailable') }
    finally { if (!controller.signal.aborted) setBusy(false); if (opening.current === controller) opening.current = null }
  }
  if (activeRole) return <CommerceWorkspace key={activeRole} apiBase={`/api/enterprise/commerce/${activeRole}`} onReturn={() => { setActiveRole(null); onActiveChange(false) }}/>
  return <section className="ent-section"><h2>{t('commerceTitle')}</h2><p className="ent-muted">{t('commerceHint')}</p><Button disabled={busy} onClick={() => { void open(true) }}>{t(busy ? 'commerceOpening' : 'commerceOpen')}</Button>{merchantEnabled && <Button disabled={busy} onClick={() => { void open(false, 'merchant') }}>{t('commerceMerchant')}</Button>}{error && <><p role="alert">{t(error)}</p><Button disabled={busy} onClick={() => { void open(false, attemptRole) }}>{t('commerceResume')}</Button></>}</section>
}
