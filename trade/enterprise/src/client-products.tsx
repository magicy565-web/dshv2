/** Product management edits the existing GEO records and retains confirmed revisions. */
import { useEffect, useRef, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { geoFields, geoId, geoMissing } from './geo-schema.ts'
import type { GeoFields, GeoRecord } from './geo-schema.ts'
import type { State } from './model.ts'
import type { Asset } from './schema.ts'
import { ProductDetails } from './client-product-details.tsx'

type T = PropsLocale<'enterprise'>['t']
type Edit = { id: GeoRecord['id']; base?: GeoRecord; fields: GeoFields; original: string }

function ProductContent({ record, files, t }: { record: GeoFields; files: Asset[]; t: T }) {
  return <div className="ent-product-content"><h3>{record.name}</h3><p>{record.description}</p><dl>{record.sections.map((section, index) => <div key={index}><dt>{section.label}</dt><dd>{section.content}<small>{section.source}</small></dd></div>)}</dl>
    {record.questions && <p role="note">{t('productQuestions')}: {record.questions}</p>}
    {record.product && <ProductDetails product={record.product} t={t} />}
    <div className="ent-product-assets">{record.assetIds?.map(id => { const file = files.find(file => file.id === id); return file ? <a key={id} href={`/api/enterprise/file?id=${id}&download=1`}>{file.category === 'image' && <img src={`/api/enterprise/file?id=${id}`} alt={file.name} />}{file.name}</a> : <span key={id}>{t('sourceMissing')}</span> })}</div>
  </div>
}

/**
 * Browse, revise, confirm and archive durable product records.
 * @param props - Shared enterprise state and commands; explicit review binds the observed revision.
 * @returns Searchable cards and focused product editing/review dialogs.
 */
export function ProductsPanel({ state, t, command, upload, generate, onboarding, dirtyChanged }: PropsLocale<'enterprise'> & {
  state: State; command: (action: 'draft' | 'confirm' | 'archive', body: unknown) => Promise<boolean>;
  upload: (files: File[]) => Promise<boolean>; generate: (prompt: string, fresh?: boolean) => Promise<boolean>; onboarding: () => void; dirtyChanged: (dirty: boolean) => void;
}) {
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all')
  const [editor, setEditor] = useState<Edit | null>(null), [review, setReview] = useState<GeoRecord | null>(null), [discard, setDiscard] = useState(false)
  const [invalid, setInvalid] = useState(false), [saved, setSaved] = useState(false)
  const [starting, setStarting] = useState(false), [startFailed, setStartFailed] = useState(false)
  const input = useRef<HTMLInputElement>(null), uploadBefore = useRef<Set<string> | null>(null)
  const files = state.data?.files ?? []
  const records = state.data?.geo.filter(record => record.kind === 'product') ?? []
  const current = records.filter(record => !records.some(next => next.supersedesId === record.id))
  const visible = current.filter(record => (filter === 'archived' ? Boolean(record.archivedAt) : !record.archivedAt && (filter === 'all' || record.status === filter)) && `${record.name} ${record.description} ${record.product?.identity.sku ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const dirty = Boolean(editor && JSON.stringify(editor.fields) !== editor.original)
  useEffect(() => { dirtyChanged(dirty); return () => dirtyChanged(false) }, [dirty, dirtyChanged])
  useEffect(() => {
    if (!uploadBefore.current) return
    const added = files.filter(file => !uploadBefore.current!.has(file.id))
    if (added.length) {
      setEditor(value => value ? { ...value, fields: { ...value.fields, assetIds: [...new Set([...(value.fields.assetIds ?? []), ...added.map(file => file.id)])] } } : null)
      added.forEach(file => uploadBefore.current!.add(file.id))
    }
    if (!state.busy) uploadBefore.current = null
  }, [files, state.busy])
  const change = (patch: Partial<GeoFields>) => setEditor(value => value ? { ...value, fields: { ...value.fields, ...patch } } : null)
  const close = () => { if (state.busy) return; if (dirty) setDiscard(true); else setEditor(null) }
  const edit = (base?: GeoRecord) => {
    const fields = base ? geoFields.strip().parse(base) : { kind: 'product' as const, name: '', description: '', sections: [], questions: '', assetIds: [] }
    setEditor({ id: base?.status === 'draft' ? base.id : geoId.parse(crypto.randomUUID()), ...(base ? { base } : {}), fields, original: JSON.stringify(fields) }); setInvalid(false); setSaved(false)
  }
  return <section className="ent-products"><div className="ent-toolbar"><div><h2>{t('products')}</h2><p className="ent-muted">{t('productHint')}</p></div><Button variant="primary" onClick={() => edit()}>{t('productNew')}</Button></div>
    <div className="ent-toolbar"><Input value={search} onChange={event => setSearch(event.target.value)} aria-label={t('productSearch')} placeholder={t('productSearch')} /><select value={filter} aria-label={t('products')} onChange={event => setFilter(event.target.value)}>{Object.entries({ all: 'productAll', draft: 'productDraft', confirmed: 'productConfirmed', archived: 'productArchived' } as const).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></div>
    {saved && <p role="status">{t('productSaved')}</p>}{startFailed && <p role="alert">{t('generationFailed')}</p>}
    {!visible.length ? <div className="ent-empty"><h3>{t(records.length ? 'noMatch' : 'productEmpty')}</h3><p>{t('productEmptyHint')}</p><Button onClick={onboarding}>{t('sourceChoose')}</Button></div> : <div className="ent-product-grid">{visible.map(record => {
      const image = files.find(file => record.assetIds?.includes(file.id) && file.category === 'image')
      return <article className="ent-product-card" key={record.id}>{image && <img className="ent-product-cover" src={`/api/enterprise/file?id=${image.id}`} alt={record.name} />}
        <span className="ent-status">{t(record.archivedAt ? 'productArchived' : record.status === 'draft' ? 'productDraft' : 'productConfirmed')}</span><ProductContent record={record} files={files} t={t} />
        <div className="ent-actions">{!record.archivedAt && <><Button size="sm" disabled={state.busy} onClick={() => edit(record)}>{t('productEdit')}</Button><Button size="sm" disabled={state.busy || starting} onClick={() => { setStarting(true); setStartFailed(false); void generate(`/product-geo ${t('productAgentPrompt', { id: record.id })}`, true).then(ok => setStartFailed(!ok)).finally(() => setStarting(false)) }}>{t('productAgent')}</Button>{record.status === 'draft' && <Button size="sm" disabled={state.busy} onClick={() => setReview(record)}>{t('productReview')}</Button>}</>}
          <Button size="sm" disabled={state.busy} onClick={() => { void command('archive', { id: record.id, expectedRevision: record.revision, archived: !record.archivedAt }) }}>{t(record.archivedAt ? 'productRestore' : 'productArchive')}</Button>
        </div></article>
    })}</div>}
    <Modal open={editor !== null} onClose={close} title={t(editor?.base ? 'productEdit' : 'productNew')} closeLabel={t('close')} className="ent-dialog ent-product-dialog">
      {editor && <form onSubmit={event => { event.preventDefault(); const parsed = geoFields.safeParse(editor.fields); setInvalid(!parsed.success); if (!parsed.success) return; const product = parsed.data.product ? (({ publication: _publication, ...content }) => content)(parsed.data.product) : undefined; void command('draft', { id: editor.id, expectedRevision: editor.base?.status === 'draft' ? editor.base.revision : 0, supersedesId: editor.base?.status === 'confirmed' ? editor.base.id : editor.base?.supersedesId ?? null, fields: { ...parsed.data, ...(product ? { product } : {}) } }).then(ok => { if (ok) { setEditor(null); setSaved(true) } }) }}>
        {editor.base?.status === 'confirmed' && <p>{t('productRevisionHint')}</p>}
        <fieldset disabled={state.busy} className="ent-product-fields"><label className="ent-field"><span>{t('productName')}</span><Input required maxLength={160} value={editor.fields.name} onChange={event => change({ name: event.target.value })} /></label>
          <label className="ent-field"><span>{t('productDescription')}</span><textarea aria-label={t('productDescription')} maxLength={5000} value={editor.fields.description} onChange={event => change({ description: event.target.value })} /></label>
          <h3>{t('productSections')}</h3>{editor.fields.sections.map((section, index) => <div className="ent-product-section" key={index}>{(['label', 'content', 'source'] as const).map(key => <label className="ent-field" key={key}><span>{t(({ label: 'productSectionLabel', content: 'productSectionContent', source: 'productSectionSource' } as const)[key])}</span><textarea required aria-label={t(({ label: 'productSectionLabel', content: 'productSectionContent', source: 'productSectionSource' } as const)[key])} value={section[key]} maxLength={key === 'label' ? 160 : key === 'source' ? 1000 : 3000} onChange={event => change({ sections: editor.fields.sections.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item) })} /></label>)}<Button size="sm" onClick={() => change({ sections: editor.fields.sections.filter((_, i) => i !== index) })}>{t('delete')}</Button></div>)}
          <Button disabled={editor.fields.sections.length >= 40} onClick={() => change({ sections: [...editor.fields.sections, { label: '', content: '', source: t('productSourceUser') }] })}>{t('productAddSection')}</Button>
          <label className="ent-field"><span>{t('productQuestions')}</span><textarea aria-label={t('productQuestions')} maxLength={2000} value={editor.fields.questions} onChange={event => change({ questions: event.target.value })} /></label>
          <h3>{t('productFiles')}</h3><input type="file" hidden multiple ref={input} onChange={event => { const selected = Array.from(event.target.files ?? []); event.target.value = ''; if (selected.length) { uploadBefore.current = new Set(files.map(file => file.id)); void upload(selected) } }} /><Button onClick={() => input.current?.click()}>{t('upload')}</Button>
          <div className="ent-product-file-picker">{files.map(file => <label key={file.id}><input type="checkbox" checked={editor.fields.assetIds?.includes(file.id) ?? false} onChange={event => change({ assetIds: event.target.checked ? [...(editor.fields.assetIds ?? []), file.id] : editor.fields.assetIds?.filter(id => id !== file.id) ?? [] })} />{file.category === 'image' && <img src={`/api/enterprise/file?id=${file.id}`} alt="" />}<span>{file.source?.path ?? file.name}</span></label>)}</div>
          {editor.fields.assetIds?.filter(id => !files.some(file => file.id === id)).map(id => <label className="ent-field" key={id}><input type="checkbox" checked onChange={() => change({ assetIds: editor.fields.assetIds?.filter(item => item !== id) })} />{t('sourceMissing')} · {id}</label>)}
        </fieldset>{(invalid || state.error) && <p role="alert">{t(state.error ?? 'invalid')}</p>}<div className="ent-actions"><Button type="submit" variant="primary" disabled={state.busy}>{t('productSave')}</Button><Button disabled={state.busy} onClick={close}>{t('cancel')}</Button></div>
      </form>}
    </Modal>
    <Modal open={review !== null} onClose={() => { if (!state.busy) setReview(null) }} title={t('productConfirmTitle')} closeLabel={t('close')} className="ent-dialog ent-product-dialog">
      {review && <><p>{t('productConfirmHint')}</p><ProductContent record={review} files={files} t={t} />{geoMissing(review).length > 0 && <p role="alert">{t('geoIncomplete')}</p>}{state.error && <p role="alert">{t(state.error)}</p>}<Button variant="primary" disabled={state.busy || geoMissing(review).length > 0} onClick={() => { void command('confirm', { id: review.id, expectedRevision: review.revision }).then(ok => { if (ok) setReview(null) }) }}>{t('geoConfirm')}</Button></>}
    </Modal>
    <Modal open={discard} onClose={() => setDiscard(false)} title={t('productDiscardTitle')} closeLabel={t('close')} description={t('productDiscardHint')} footer={<><Button onClick={() => setDiscard(false)}>{t('cancel')}</Button><Button onClick={() => { setDiscard(false); setEditor(null) }}>{t('supplierDiscard')}</Button></>} />
  </section>
}

/** Product cards and forms preserve the enterprise palette across narrow viewports. */
export const productStyle = `
.ent-product-dialog{max-height:calc(100dvh - 48px);overflow-y:auto!important;overscroll-behavior:contain}
.ent-product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:20px}.ent-product-card{padding:22px;border:1px solid var(--workbench-line);background:var(--workbench-paper);border-radius:14px;min-width:0}.ent-product-cover{width:100%;height:180px;object-fit:contain;margin-bottom:16px}.ent-product-content{overflow-wrap:anywhere}.ent-product-content>p{color:var(--workbench-muted);font-size:13px;line-height:1.7}.ent-product-content dl{font-size:13px}.ent-product-content dl>div{margin:12px 0}.ent-product-content dt{font-weight:600}.ent-product-content dd{margin:4px 0;white-space:pre-wrap}.ent-product-content small{display:block;color:var(--workbench-muted);margin-top:6px}.ent-product-assets{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.ent-product-assets a{display:grid;gap:6px;font-size:12px}.ent-product-assets img{width:72px;height:64px;object-fit:cover;border-radius:6px}.ent-product-dialog{width:min(760px,calc(100vw - 32px))!important}.ent-product-fields{border:0;padding:0;min-width:0}.ent-product-fields>.ent-field{margin:16px 0}.ent-product-section{border:1px solid var(--workbench-line);border-radius:10px;padding:14px;margin:12px 0;display:grid;gap:12px}.ent-product-file-picker{max-height:240px;overflow:auto;margin:14px 0}.ent-product-file-picker label{display:flex;gap:10px;align-items:center;padding:8px;overflow-wrap:anywhere}.ent-product-file-picker img{width:40px;height:40px;object-fit:cover}.ent-product-card>.ent-actions{flex-wrap:wrap}
`
