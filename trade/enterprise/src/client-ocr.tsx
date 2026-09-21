/** Explicit recognition and review preserve the original image or scanned PDF. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Asset } from './schema.ts'
import { ocrReview } from './ocr-schema.ts'
import type { z } from 'zod'

/**
 * Show page-labelled recognition beside the original file download.
 * @param props - Saved asset, locale and Host mutation action.
 * @returns Recognition action or an explicit human review of its immutable receipt.
 */
export function SourceRecognition({ asset, busy, recognize, t }: PropsLocale<'enterprise'> & { asset: Asset; busy: boolean; recognize: (id: Asset['id'], receiptId?: NonNullable<Asset['ocr']>['id']) => Promise<boolean> }) {
  const [working, setWorking] = useState(false)
  const [open, setOpen] = useState(false)
  const [review, setReview] = useState<z.infer<typeof ocrReview>>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!open || !asset.ocr) return
    const abort = new AbortController()
    setReview(undefined); setFailed(false)
    void fetch(`/api/enterprise/sources/recognition?id=${asset.id}`, { signal: abort.signal, credentials: 'same-origin' }).then(async response => {
      if (!response.ok) throw new Error('Recognition review failed')
      const value = ocrReview.parse(await response.json())
      if (!abort.signal.aborted) setReview(value)
    }).catch(() => { if (!abort.signal.aborted) setFailed(true) })
    return () => abort.abort()
  }, [open, asset.id, asset.ocr?.id])
  return <div className="ent-ocr">
    {asset.ocr ? <>
      <p>{t(asset.ocr.reviewedAt ? 'ocrReviewed' : 'ocrPending')}</p>
      <Button size="sm" disabled={busy} onClick={() => setOpen(!open)}>{t(open ? 'close' : 'ocrReview')}</Button>
      {open && <div className="ent-ocr-review"><p>{t('ocrHint')}</p>
        {failed && <p role="alert">{t('serverError')}</p>}
        {review?.chunks.map((chunk, index) => <section key={index}><strong>{t('ocrPage', { page: chunk.page })}</strong><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{chunk.text}</pre></section>)}
        {!asset.ocr.reviewedAt && <Button disabled={busy || !review || review.receipt.id !== asset.ocr.id} onClick={() => { void recognize(asset.id, asset.ocr!.id) }}>{t('ocrConfirm')}</Button>}
      </div>}
    </> : <><Button size="sm" disabled={busy || working} onClick={() => { setWorking(true); void recognize(asset.id).finally(() => setWorking(false)) }}>{t(working ? 'ocrWorking' : 'ocrStart')}</Button><p>{t('ocrHint')}</p></>}
    {asset.ocrError && <p role="alert">{t(asset.ocrError)}</p>}
  </div>
}
