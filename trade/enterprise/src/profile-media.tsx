/** User-selected display images are independent of supplier claims and source attestation. */
import { useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Asset } from './schema.ts'
import type { SupplierT } from './supplier-editor.tsx'
import { SupplierDialog } from './supplier-dialog.tsx'

/**
 * Preserve an image-sized space when no asset is selected.
 * @param props - Optional uploaded image, localized slot labels and selection action.
 * @returns An image with replacement control or an actionable empty image slot.
 */
export function ProfileMedia({ asset, label, hint, t, choose, cover = false }: {
  asset: Asset | undefined; label: string; hint: string; t: SupplierT; choose: () => void; cover?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const visible = asset && failed !== asset.id
  return <div className={`sp-photo${cover ? ' sp-photo-cover' : ''}`}>
    {visible ? <><img src={`/api/enterprise/file?id=${encodeURIComponent(asset.id)}`} alt={asset.name} loading={cover ? 'eager' : 'lazy'} onError={() => setFailed(asset.id)} /><button className="sp-photo-change" type="button" onClick={choose} aria-label={t('supplierChooseFor', { name: label })}>{t('supplierChangeImage')}</button><span className="sp-photo-caption">{asset.name}</span></> : <button className="sp-photo-empty" type="button" onClick={choose} aria-label={t('supplierChooseFor', { name: label })}>
      <span className="sp-photo-outline" aria-hidden="true"><span /></span><strong>{label}</strong><span>{hint}</span><span className="sp-photo-add">{t('supplierAddImage')}</span>
    </button>}
  </div>
}

/**
 * Choose or upload an enterprise image without changing supplier evidence.
 * @param props - Available assets, current selection and persisted media actions.
 * @returns A thumbnail picker with upload, removal and failure feedback.
 */
export function ProfileMediaPicker({ files, selectedId, t, select, upload, close }: {
  files: Asset[]; selectedId: string | null; t: SupplierT; select: (id: Asset['id'] | null) => Promise<boolean>; upload: (files: File[]) => Promise<boolean>; close: () => void;
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const act = async (action: () => Promise<boolean>, finish: boolean) => {
    if (busy) return
    setBusy(true); setError(false)
    try { const ok = await action(); setError(!ok); if (ok && finish) close() }
    catch { setError(true) }
    finally { setBusy(false) }
  }
  const images = files.filter(file => file.category === 'image')
  return <SupplierDialog className="ent-dialog sp-media-picker" title={t('supplierChooseImage')} closeLabel={t('close')} onClose={() => { if (!busy) close() }}>
    <p className="sp-muted">{t('supplierImageNotice')}</p>
    <input ref={input} hidden type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.avif" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void act(() => upload(files), false) }} />
    {error && <p role="alert">{t('supplierError')}</p>}
    {!images.length && <p className="sp-media-empty">{t('supplierNoImages')}</p>}
    <div className="sp-media-choices">{images.map(file => <button key={file.id} type="button" aria-pressed={file.id === selectedId} disabled={busy} onClick={() => { void act(() => select(file.id), true) }}><img src={`/api/enterprise/file?id=${encodeURIComponent(file.id)}`} alt="" loading="lazy" /><span>{file.name}</span></button>)}</div>
    <div className="sp-detail-actions"><Button variant="primary" disabled={busy} onClick={() => input.current?.click()}>{t('supplierUploadImage')}</Button>{selectedId && <Button disabled={busy} onClick={() => { void act(() => select(null), true) }}>{t('supplierRemoveImage')}</Button>}</div>
  </SupplierDialog>
}
