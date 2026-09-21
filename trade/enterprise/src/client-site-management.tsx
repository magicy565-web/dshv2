/** Explicit management confirmation preserves offline sites and their archived history. */
import { useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/** Rename, archive, restore or delete the selected website with optimistic metadata checks.
 * @param props - Observed metadata and the parent-owned request lifecycle.
 * @returns Localized management controls.
 */
export function SiteManagement({ site, disabled, change, t }: PropsLocale<'sites'> & { site: { name: string; archived?: boolean | undefined; managementVersion?: number | undefined }; disabled: boolean; change: (action: 'manage' | 'delete', body: unknown) => Promise<boolean> }) {
  const [name, setName] = useState(site.name)
  const [confirm, setConfirm] = useState<'archive' | 'delete'>()
  const command = (action: 'manage' | 'delete', values: object) => change(action, { ...values, expectedVersion: site.managementVersion ?? 0, confirmed: true }).then(done => { if (done) setConfirm(undefined) })
  return <details className="site-secondary-options"><summary>{t('manageSite')}</summary><fieldset disabled={disabled}><div className="site-toolbar"><label>{t('siteName')}<Input maxLength={160} value={name} onChange={event => setName(event.target.value)} /></label><Button disabled={!name.trim() || name.trim() === site.name} onClick={() => { void command('manage', { name: name.trim() }) }}>{t('renameSite')}</Button><Button onClick={() => { if (site.archived) void command('manage', { archived: false }); else setConfirm('archive') }}>{t(site.archived ? 'restoreSite' : 'archiveSite')}</Button>{site.archived && <Button onClick={() => setConfirm('delete')}>{t('deleteSite')}</Button>}</div>{confirm && <div role="region" aria-label={t('manageConfirm')}><p>{t(confirm === 'delete' ? 'deleteSiteHelp' : 'archiveSiteHelp')}</p><Button onClick={() => { void command(confirm === 'delete' ? 'delete' : 'manage', confirm === 'delete' ? {} : { archived: true }) }}>{t('manageConfirm')}</Button><Button onClick={() => setConfirm(undefined)}>{t('cancel')}</Button></div>}</fieldset></details>
}
