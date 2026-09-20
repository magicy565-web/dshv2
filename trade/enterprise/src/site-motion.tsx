/** A compact introduction to creating and reviewing a saved website. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

const steps = [
  { titleKey: 'startContent', detail: 'startContentDetail' },
  { titleKey: 'startPreview', detail: 'startPreviewDetail' },
  { titleKey: 'startPublish', detail: 'startPublishDetail' },
] as const

/** Explain the website workflow beside the available creation actions.
 * @param props - Copy from the Sites locale dictionary.
 * @returns Static guidance with no site or hosting actions.
 */
export function SiteExperience({ t }: PropsLocale<'sites'>) {
  return <section className="site-introduction" aria-label={t('startGuide')}>
    <div className="site-introduction-heading"><span className="site-introduction-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z" /></svg></span><div><h2>{t('empty')}</h2><p>{t('emptyDetail')}</p></div></div>
    <ol className="site-start-steps">{steps.map((step, index) => <li key={step.titleKey}><span className="site-step-number" aria-hidden="true">{index + 1}</span><div><strong>{t(step.titleKey)}</strong><p>{t(step.detail)}</p></div></li>)}</ol>
  </section>
}
