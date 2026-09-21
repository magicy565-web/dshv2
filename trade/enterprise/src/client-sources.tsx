/** Browser folder selection transfers only chosen files and renders the persisted import inventory. */
import { useRef, useState } from 'react'
import { Button, fileSizeText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { State, createModel } from './model.ts'
import { sourceExclusion } from './source-schema.ts'
import { zh } from './locales.ts'
import type { EnterpriseKey } from './locales.ts'
import { SourceRecognition } from './client-ocr.tsx'

/**
 * Import a folder before or after company creation and resume interrupted batches.
 * @param props - Server snapshot, upload action, localized labels and explicit Agent start.
 * @returns Folder chooser, review of selected files and durable reading status.
 */
export function SourcePanel({ state, t, importSources, recognize, start }: PropsLocale<'enterprise'> & { state: State; recognize: ReturnType<typeof createModel>['recognize']; importSources: (files: File[], resumeId?: string) => Promise<boolean>; start: () => Promise<boolean> }) {
  const input = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [resume, setResume] = useState<string>()
  const [starting, setStarting] = useState(false)
  const [startFailed, setStartFailed] = useState(false)
  const batches = state.data?.imports ?? []
  const assets = new Map(state.data?.files.map(asset => [asset.id, asset]))
  const entries = batches.flatMap(batch => batch.files)
  const uploaded = entries.filter(file => file.status === 'imported' && file.fileId && assets.has(file.fileId)).length
  const failed = entries.filter(file => file.status === 'failed').length
  const needsInput = entries.filter(file => file.assessment?.disposition === 'needs_input').length
  const readable = entries.filter(file => file.fileId && assets.get(file.fileId)?.knowledgeStatus === 'ready')
  const pending = batches.some(batch => batch.files.some(file => file.status === 'pending'))
  const statuses = { pending: 'sourcePending', imported: 'sourceImported', skipped: 'sourceSkipped', failed: 'sourceFailed' } as const
  const dispositions = { used: 'sourceUsed', excluded: 'sourceExcluded', needs_input: 'sourceNeedsInput' } as const
  return <section className="ent-source-panel">
    <div className="wb-section-heading"><div><h2>{t('sourceTitle')}</h2><p>{t('sourceHint')}</p></div></div>
    <input hidden type="file" multiple ref={element => { input.current = element; element?.setAttribute('webkitdirectory', '') }} onChange={event => { setFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <div className="ent-actions"><Button variant="outline" disabled={state.busy || starting} onClick={() => { setResume(undefined); input.current?.click() }}>{t('sourceChoose')}</Button>
      {batches.length > 0 && <Button variant="primary" disabled={state.busy || starting || pending || files.length > 0} onClick={() => { setStarting(true); setStartFailed(false); void start().then(ok => setStartFailed(!ok)).finally(() => setStarting(false)) }}>{t(starting ? 'startingGeneration' : 'sourceStart')}</Button>}
    </div>
    {startFailed && <p role="alert">{t('generationFailed')}</p>}
    {files.length > 0 && <div className="ent-source-selection"><strong>{t('sourceSelection', { count: files.length, size: fileSizeText(files.reduce((total, file) => total + file.size, 0)) })}</strong><p>{t('sourceSelectionHint')}</p>
      <ul>{files.map(file => { const path = file.webkitRelativePath || file.name; const excluded = sourceExclusion(path); return <li key={path}><span>{path}</span><small>{excluded ? t(excluded) : fileSizeText(file.size)}</small></li> })}</ul>
      <div className="ent-actions"><Button variant="primary" disabled={state.busy} onClick={() => { void importSources(files, resume).then(ok => { if (ok) { setFiles([]); setResume(undefined) } }) }}>{t(state.busy ? 'sourceWorking' : 'sourceImport')}</Button><Button disabled={state.busy} onClick={() => { setFiles([]); setResume(undefined) }}>{t('cancel')}</Button></div>
    </div>}
    {batches.length > 0 && <div className="ent-source-summary" role="status"><p>{t('sourceUploadSummary', { uploaded, total: entries.length, pending: entries.filter(file => file.status === 'pending').length, failed, skipped: entries.filter(file => file.status === 'skipped').length })}</p><p>{t('sourceReadSummary', { read: readable.reduce((sum, file) => sum + file.readChunks.length, 0), total: readable.reduce((sum, file) => sum + file.chunkCount, 0), needsInput })}</p></div>}
    <p className="ent-muted">{t(!batches.length ? 'sourceEmpty' : pending || failed ? 'sourceRetryHint' : 'sourceContinueHint')}</p>
    {batches.length > 0 && <details className="ent-source-history" open><summary>{t('sourceHistory')}</summary>{batches.map(batch => <section key={batch.id}>
      <div className="ent-toolbar"><strong>{batch.files[0]?.path.split('/')[0]}</strong><span>{new Date(batch.createdAt).toLocaleString()}</span></div>
      {batch.files.some(file => file.status === 'pending' || file.status === 'failed') && <Button size="sm" disabled={state.busy} onClick={() => { setResume(batch.id); input.current?.click() }}>{t('sourceResume')}</Button>}
      <ul>{batch.files.map(file => {
        const asset = file.fileId ? assets.get(file.fileId) : undefined
        return <li key={file.path}><div><strong>{file.path}</strong><p>{t(statuses[file.status])}{asset && ` · ${t(asset.knowledgeStatus === 'ready' ? 'sourceReady' : asset.knowledgeStatus === 'empty' ? 'sourceNoText' : asset.knowledgeStatus === 'failed' ? 'sourceParseFailed' : 'sourceMedia')}`}{file.fileId && !asset && ` · ${t('sourceMissing')}`}</p>
          {asset?.knowledgeStatus === 'ready' && <p>{t('sourceRead', { read: file.readChunks.length, total: file.chunkCount })}</p>}
          {asset?.textTruncated && <p>{t('sourceTruncated')}</p>}
          {asset && (state.data?.ocrEnabled || asset.ocr) && (asset.mime === 'application/pdf' || ['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(asset.mime)) && <SourceRecognition asset={asset} busy={state.busy} recognize={recognize} t={t} />}
          {file.assessment ? <p>{t(dispositions[file.assessment.disposition])} · {file.assessment.reason}</p> : file.status === 'imported' && <p>{t('sourceUnassessed')}</p>}
          {file.error && <p>{t(file.error === 'missing' ? 'sourceMissing' : Object.hasOwn(zh, file.error) ? file.error as EnterpriseKey : 'uploadFailed')}</p>}
        </div>{asset && <a href={`/api/enterprise/file?id=${asset.id}&download=1`}>{t('download')}</a>}</li>
      })}</ul>
    </section>)}</details>}
  </section>
}

/** Responsive inventory styling shared with the product library. */
export const sourceStyle = `
.ent-source-panel{margin:24px 0;padding:24px;border:1px solid var(--workbench-line);border-radius:14px;background:var(--workbench-paper)}
.ent-source-panel ul{list-style:none;padding:0;max-height:360px;overflow:auto}.ent-source-panel li{display:flex;justify-content:space-between;gap:18px;padding:12px 0;border-bottom:1px solid var(--workbench-line);overflow-wrap:anywhere;font-size:13px}.ent-source-panel li>div{min-width:0}.ent-source-panel li p{font-size:12px;color:var(--workbench-muted);margin:4px 0}.ent-source-panel small{flex-shrink:0}.ent-source-selection{padding:18px 0}.ent-source-history{margin-top:20px}.ent-source-history summary{cursor:pointer;font-weight:600}.ent-source-history section{padding-top:16px}.ent-source-panel>.ent-muted{line-height:1.7}
@media(max-width:600px){.ent-source-panel{padding:16px}.ent-source-panel li{gap:10px}.ent-source-panel .ent-actions{flex-wrap:wrap}}
`
