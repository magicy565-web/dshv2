/** Saved revision comparisons and activity reconstructed from the site's Session. */
import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { siteStateChangeSchema } from '../../../packages/site/site/src/session.ts'

const files = z.array(z.object({ path: z.string(), content: z.string(), encoding: z.enum(['utf8', 'base64']) }))
const contentSchema = z.object({ project: z.object({ framework: z.string(), files }).optional() }).passthrough()
const differenceSchema = z.object({ added: z.array(z.unknown()), removed: z.array(z.unknown()), changed: z.array(z.unknown()), themeChanged: z.boolean(), pageOrderChanged: z.boolean(), productOrderChanged: z.boolean(), files: z.object({ added: z.array(z.string()), removed: z.array(z.string()), changed: z.array(z.string()), frameworkChanged: z.boolean() }) })

/** Compare two immutable revisions, with text before/after and explicit binary changes.
 * @param props - Authorized site, selected revision and saved history.
 * @returns Read-only difference review.
 */
export function SiteDiffPanel({ siteId, revisionId, versions, t }: PropsLocale<'sites'> & { siteId: string; revisionId: string; versions: readonly { id: string; createdAt: string }[] }) {
  const index = versions.findIndex(item => item.id === revisionId)
  const [base, setBase] = useState(versions[index + 1]?.id ?? '')
  const baseId = base || versions[index + 1]?.id
  const [result, setResult] = useState<{ diff: z.infer<typeof differenceSchema>; before: z.infer<typeof contentSchema>; after: z.infer<typeof contentSchema> }>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setResult(undefined); setFailed(false)
    const read = async (action: string, selected: string) => {
      const response = await fetch(`/api/enterprise/sites?${new URLSearchParams({ siteId, action, revisionId: selected, ...(action === 'diff' && baseId ? { baseRevisionId: baseId } : {}) })}`, { signal: controller.signal })
      if (!response.ok) throw new Error('revision comparison')
      return response.json() as Promise<unknown>
    }
    void Promise.all([read('diff', revisionId), baseId ? read('content', baseId) : Promise.resolve({}), read('content', revisionId)]).then(([diff, before, after]) => { if (!controller.signal.aborted) setResult({ diff: differenceSchema.parse(diff), before: contentSchema.parse(before), after: contentSchema.parse(after) }) }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [siteId, revisionId, baseId])
  const source = (side: 'before' | 'after', path: string) => {
    const file = result?.[side].project?.files.find(item => item.path === path)
    return file ? file.encoding === 'base64' ? t('binaryChange') : file.content : t('fileAbsent')
  }
  return <section className="site-diff"><label>{t('compareBase')}<select value={base} onChange={event => setBase(event.target.value)}><option value="">{t('previousVersion')}</option>{versions.filter(item => item.id !== revisionId).map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.id}</option>)}</select></label>{failed ? <p role="alert">{t('error')}</p> : !result ? <p>{t('loading')}</p> : <>
    {(['added', 'removed', 'changed'] as const).map(kind => <div key={kind}><h3>{t(kind)} ({result.diff.files[kind].length})</h3>{result.diff.files[kind].map(path => <details key={path}><summary>{path}</summary><div className="site-diff-columns"><div><h4>{t('before')}</h4><pre>{source('before', path)}</pre></div><div><h4>{t('after')}</h4><pre>{source('after', path)}</pre></div></div></details>)}</div>)}
    {(result.diff.themeChanged || result.diff.pageOrderChanged || result.diff.productOrderChanged || result.diff.files.frameworkChanged || result.diff.added.length + result.diff.removed.length + result.diff.changed.length > 0) && <details><summary>{t('structuredChanges')}</summary><pre>{JSON.stringify(result.diff, null, 2)}</pre></details>}
  </>}</section>
}

/** Show the persisted site projection and its committed activity records.
 * @param props - Authorized site and localized copy.
 * @returns Read-only Session activity.
 */
export function SiteActivityPanel({ siteId, t }: PropsLocale<'sites'> & { siteId: string }) {
  const [records, setRecords] = useState<z.infer<typeof siteStateChangeSchema>[]>()
  const [error, setError] = useState(false)
  const [latest, setLatest] = useState<z.infer<typeof siteStateChangeSchema> | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setRecords(undefined); setLatest(null); setError(false)
    void fetch(`/api/enterprise/sites?${new URLSearchParams({ siteId, action: 'activity' })}`, { signal: controller.signal }).then(async response => { if (!response.ok) throw new Error('activity'); return response.json() as Promise<unknown> }).then(value => { const parsed = z.object({ state: z.unknown(), events: z.array(z.unknown()) }).parse(value); const state = siteStateChangeSchema.nullable().parse(parsed.state); const events = parsed.events.map(event => siteStateChangeSchema.parse(event)); if (!controller.signal.aborted) { setRecords(events); setLatest(state) } }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [siteId])
  return <section><p>{t('activityHelp')}</p>{latest?.site && <p>{latest.site.name} · {t(latest.site.archived ? 'archived' : latest.site.publishedRevisionId ? 'published' : 'draft')} · {latest.site.currentRevisionId}</p>}{error ? <p role="alert">{t('error')}</p> : !records ? <p>{t('loading')}</p> : !records.length ? <p>{t('activityEmpty')}</p> : <ol>{[...records].reverse().map(record => <li key={record.sequence}><time>{new Date(record.time).toLocaleString()}</time> · {record.site?.name ?? t('deletedSite')} · {record.site?.archived ? t('archived') : t(record.site?.publishedRevisionId ? 'published' : 'draft')}<p>{t('history')}: {record.revisions.length} · {t('publicationJobs')}: {record.jobs.map(job => t(job.status)).join(', ') || '—'}</p></li>)}</ol>}</section>
}
