/** Persistent company onboarding entry with progress derived from reviewed records. */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { State } from './model.ts'
import { ProfileIcon } from './profile-icons.tsx'

type Props = PropsLocale<'enterprise'> & {
  state: State; conversationStarted: boolean; open: () => Promise<boolean>;
}

/**
 * Display a stable initialization entry without issuing model requests on mount.
 * @param props - Company projection, localized copy and explicit conversation action.
 * @returns Progress, source guidance and the same conversation's resume action.
 */
export function OnboardingPanel({ t, state, conversationStarted, open }: Props) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const data = state.data
  const completed = Boolean(data?.onboarding.completedAt)
  const confirmed = data?.geo.some(record => record.kind === 'company' && record.status === 'confirmed') ?? false
  const started = Boolean(data?.profile || data?.geo.length)
  const steps = [started, Boolean(data?.files.some(file => file.knowledgeStatus === 'ready') || data?.geo.some(record => record.sections.some(section => section.source.trim()))), confirmed, completed]
  const done = steps.filter(Boolean).length
  const next = steps.findIndex(step => !step)
  const hints = { onboardingIdentity: 'onboardingIdentityHint', onboardingSources: 'onboardingSourcesHint', onboardingReview: 'onboardingReviewHint', onboardingFinish: 'onboardingFinishHint' } as const
  return <section className="sp-setup">
    <div className="sp-setup-heading"><span className="sp-kicker">{t('assistantTitle')}</span><h2>{t(completed ? 'onboardingDoneTitle' : 'onboardingWelcome')}</h2><p>{t(completed ? 'onboardingDoneHint' : 'onboardingHint')}</p></div>
    <div className="sp-setup-layout"><div className="sp-setup-conversation"><span className="wb-icon"><ProfileIcon name="sparkle" size={26} /></span><h2>{t('onboardingSessionTitle')}</h2><p>{t('onboardingSessionHint')}</p><div className="sp-setup-starter"><span>{t('onboardingExampleLabel')}</span><p>{t('onboardingExample')}</p></div>
      {(failed || state.error) && <p role="alert">{t(failed ? 'generationFailed' : state.error!)}</p>}
      <Button variant="primary" aria-busy={busy} disabled={busy || state.busy || !data} onClick={() => { setBusy(true); setFailed(false); void open().then(ok => setFailed(!ok)).finally(() => setBusy(false)) }}>{t(busy ? 'startingGeneration' : completed ? 'onboardingRevisit' : conversationStarted || started ? 'onboardingContinue' : 'onboardingStart')}</Button>
      <p className="sp-muted">{t('onboardingPrivacy')}</p>
    </div><aside className="sp-setup-progress"><header><h2>{t('onboardingProgress')}</h2><span>{t('onboardingCount', { done, total: steps.length })}</span></header><div className="wb-progress-track" aria-hidden="true">{steps.map((complete, index) => <span key={index} data-complete={complete} />)}</div><ol>{(['onboardingIdentity', 'onboardingSources', 'onboardingReview', 'onboardingFinish'] as const).map((key, index) => <li key={key} data-complete={steps[index]} aria-current={index === next ? 'step' : undefined}><span className="sp-setup-number" aria-hidden="true">{steps[index] ? '✓' : String(index + 1).padStart(2, '0')}</span><div><strong>{t(key)}</strong><p>{t(hints[key])}</p><span>{t(steps[index] ? 'onboardingStepDone' : index === next ? 'onboardingCurrent' : 'onboardingStepPending')}</span></div></li>)}</ol><p>{t('onboardingProgressHint')}</p></aside></div>
    <div className="wb-section-heading"><h2>{t('onboardingOutputTitle')}</h2></div><div className="wb-outputs">{([
      { icon: 'company', titleKey: 'onboardingOutputProfile', hint: 'onboardingOutputProfileHint' },
      { icon: 'sparkle', titleKey: 'onboardingOutputContent', hint: 'onboardingOutputContentHint' },
      { icon: 'case', titleKey: 'onboardingOutputWork', hint: 'onboardingOutputWorkHint' },
    ] as const).map(item => <div key={item.titleKey}><span className="wb-icon"><ProfileIcon name={item.icon} size={20} /></span><div><h3>{t(item.titleKey)}</h3><p>{t(item.hint)}</p></div></div>)}</div>
  </section>
}

/** First-run layout uses the shared workbench palette and respects narrow viewports. */
export const onboardingStyle = `
.sp-setup-heading{padding:12px 0 28px;max-width:720px}
.ent .sp-setup-heading h2{font:600 clamp(26px,2.4vw,34px)/1.35 var(--dsw-font-family);letter-spacing:-.03em;margin:12px 0}
.sp-setup-heading>p{font-size:14px;line-height:1.8;color:var(--workbench-muted);max-width:620px;margin:0}
.sp-setup-layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,1fr);gap:24px;align-items:start}
.sp-setup-conversation,.sp-setup-progress{border:.5px solid var(--workbench-line);border-radius:14px;padding:28px;background:var(--workbench-paper)}
.sp-setup-conversation h2{font-size:20px;line-height:1.5;margin:18px 0 10px}
.sp-setup-conversation>p{font-size:13px;line-height:1.8;color:var(--workbench-muted)}
.sp-setup-starter{padding:20px;background:var(--workbench-soft);border:.5px solid var(--workbench-line);border-radius:10px;margin:24px 0}
.sp-setup-starter>span{font-size:12px;font-weight:500;color:var(--workbench-muted)}
.sp-setup-starter>p{font:400 16px/1.9 var(--dsw-font-family);margin:10px 0 0;color:var(--workbench-ink)}
.sp-setup-conversation>button{min-height:40px;padding-inline:20px;border-radius:8px;font-weight:500}
.sp-setup-conversation>.sp-muted{font-size:12px;margin:18px 0 0;max-width:480px}
.sp-setup-progress header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.sp-setup-progress header h2{font-size:15px;margin:0}
.sp-setup-progress header>span{font-size:12px;color:var(--workbench-muted)}
.wb-progress-track{display:flex;gap:5px;margin:18px 0 24px}
.wb-progress-track>span{height:4px;flex:1;border-radius:4px;background:var(--workbench-line)}
.wb-progress-track>span[data-complete=true]{background:var(--workbench-accent)}
.sp-setup-progress ol{padding:0;margin:0;list-style:none}
.sp-setup-progress li{display:flex;gap:14px;padding:0 0 24px}
.sp-setup-number{display:grid;place-items:center;width:30px;height:30px;flex:none;border:.5px solid var(--workbench-line);background:var(--workbench-soft);border-radius:50%;corner-shape:round;font:500 11px/1 var(--ds-font-family-code);color:var(--workbench-muted)}
.sp-setup-progress li[aria-current=step] .sp-setup-number,.sp-setup-progress li[data-complete=true] .sp-setup-number{background:var(--workbench-accent-soft);color:var(--workbench-accent);border-color:var(--workbench-accent)}
.sp-setup-progress li strong{font-size:13px;font-weight:600;line-height:1.5}
.sp-setup-progress li p{font-size:12px;line-height:1.6;color:var(--workbench-muted);margin:5px 0}
.sp-setup-progress li div>span{display:inline-flex;font-size:11px;line-height:1.5;color:var(--workbench-muted)}
.sp-setup-progress li[aria-current=step] div>span{color:var(--workbench-accent);font-weight:500}
.sp-setup-progress>p{font-size:12px;line-height:1.7;color:var(--workbench-muted);margin:0;border-top:.5px solid var(--workbench-line);padding-top:18px}
@media(max-width:880px){.sp-setup-layout{grid-template-columns:1fr;gap:18px}.sp-setup-conversation,.sp-setup-progress{padding:22px}.sp-setup-heading{padding:8px 0 24px}}
`
