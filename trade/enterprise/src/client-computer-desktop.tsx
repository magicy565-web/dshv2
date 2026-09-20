/** Authenticated desktop viewer; every input refers to the displayed connector observation. */
import { useEffect, useRef, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { z } from 'zod'
import { computerConnection, desktopInput } from './computer-remote-schema.ts'
import type { ComputerBinding } from './computer-schema.ts'

/** Render a real remote screen and explicit controls, or connection instructions when unavailable.
 * @param props - Selected workstation and localized labels.
 * @returns A viewer that stops polling when closed or unmounted.
 */
export function ComputerDesktop({ computer, t }: { computer: ComputerBinding | undefined } & PropsLocale<'computers'>) {
  const [view, setView] = useState<z.infer<typeof computerConnection>>()
  const [watch, setWatch] = useState(false)
  const [control, setControl] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const locked = useRef(false)
  const lifetime = useRef(new AbortController())
  useEffect(() => {
    setView(undefined); setControl(false); setFailed(false)
    const controller = new AbortController(); lifetime.current = controller
    if (!computer || !watch) return () => controller.abort()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const response = await fetch(`/api/enterprise/computer-desktop?id=${computer.id}`, { credentials: 'same-origin', signal: controller.signal })
        if (!response.ok) throw new Error('Desktop unavailable')
        const value = computerConnection.parse(await response.json())
        if (!controller.signal.aborted) { setView(value); setFailed(false) }
      } catch { if (!controller.signal.aborted) { setFailed(true); setControl(false) } }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 2000) }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [computer?.id, watch])
  const pending = !!view?.command && ['pending', 'dispatched', 'unknown'].includes(view.command.status)
  const canControl = watch && control && !failed && !busy && !pending && view?.state === 'online' && !!view.frame && view.input
  const send = async (input: z.infer<typeof desktopInput>) => {
    if (!canControl || !computer || !view?.frame || locked.current) return
    const signal = lifetime.current.signal
    locked.current = true; setBusy(true)
    try {
      const response = await fetch('/api/enterprise/computer-desktop', { method: 'POST', credentials: 'same-origin', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ computerId: computer.id, instanceId: view.instanceId, frameId: view.frame.id, id: crypto.randomUUID(), input }) })
      if (!response.ok) throw new Error('Input not confirmed')
      const value = computerConnection.parse(await response.json())
      if (!signal.aborted) { setView(value); setText('') }
    } catch { if (!signal.aborted) { setFailed(true); setControl(false) } }
    finally { locked.current = false; if (!signal.aborted) setBusy(false) }
  }
  const state = view?.state ?? (computer?.enabled ? 'unpaired' : computer ? 'revoked' : 'unpaired')
  return <section className="cm-desktop">
    <div className="cm-desktop-bar"><div><strong>{computer?.name ?? t('desktopTitle')}</strong><span>{t(failed ? 'desktopFailed' : state)}</span></div><div className="ent-actions">
      <Button disabled={!computer?.enabled} onClick={() => { setWatch(!watch); setControl(false) }}>{t(watch ? 'stopViewing' : 'viewDesktop')}</Button>
      {watch && <Button disabled={!view?.input || !view.frame || failed} onClick={() => setControl(!control)}>{t(control ? 'stopControl' : 'takeControl')}</Button>}
    </div></div>
    <div className="cm-desktop-screen">
      {watch && !failed && view?.frame ? <img src={`data:image/png;base64,${view.frame.png}`} alt={t('desktopImage')} draggable={false} tabIndex={canControl ? 0 : -1}
        onClick={event => { if (!canControl) return; const bounds = event.currentTarget.getBoundingClientRect(); void send({ kind: 'click', x: Math.min(view.frame!.width - 1, Math.floor((event.clientX - bounds.left) * view.frame!.width / bounds.width)), y: Math.min(view.frame!.height - 1, Math.floor((event.clientY - bounds.top) * view.frame!.height / bounds.height)), button: 'left' }) }}
        onKeyDown={event => { const key = event.key === 'Enter' ? 'Return' : event.key === 'Backspace' ? 'BackSpace' : event.key.replace('Arrow', ''); const parsed = desktopInput.safeParse({ kind: 'key', key }); if (canControl && parsed.success) { event.preventDefault(); void send(parsed.data) } }} />
        : <div className="cm-desktop-empty"><span aria-hidden="true">▣</span><h2>{t(!computer ? 'connectFirst' : !watch ? 'desktopPrivate' : failed ? 'desktopFailed' : state === 'online' ? view?.desktop === 'ready' ? 'waitingFrame' : 'desktopUnavailable' : 'waitingConnector')}</h2><p>{t(!computer || state === 'unpaired' ? 'connectSteps' : 'desktopPrivacy')}</p></div>}
    </div>
    {watch && <div className="cm-desktop-footer"><span>{t('lastHeartbeat')}: {view?.lastSeenAt ? new Date(view.lastSeenAt).toLocaleTimeString() : t('noActivity')}</span><span>{view?.platform} {view?.architecture}</span><span>{view?.command ? t(view.command.status === 'unknown' ? 'inputUnknown' : view.command.status) : t('desktopPrivacy')}</span></div>}
    {watch && control && <div className="cm-desktop-controls"><p>{t('controlHelp')}</p><div className="ent-actions">{(['Return', 'Tab', 'Escape', 'BackSpace', 'ctrl+l'] as const).map(key => <Button key={key} disabled={!canControl} onClick={() => { void send({ kind: 'key', key }) }}>{t(({ Return: 'keyEnter', Tab: 'keyTab', Escape: 'keyEscape', BackSpace: 'keyBackspace', 'ctrl+l': 'keyAddress' } as const)[key])}</Button>)}</div><form className="ent-actions" onSubmit={event => { event.preventDefault(); void send({ kind: 'text', text }) }}><Input aria-label={t('remoteText')} value={text} maxLength={2000} onChange={event => setText(event.target.value)} /><Button type="submit" disabled={!canControl || !text}>{t('sendText')}</Button></form></div>}
    <details className="cm-setup"><summary>{t('connectionSetup')}</summary><ol><li>{t('setupDownload')} <a href="/api/enterprise/computer-connector" download="computer_connector.py">{t('downloadConnector')}</a></li><li>{t('setupConfigure')}<code>python3 computer_connector.py configure</code></li><li>{t('setupRun')}<code>python3 computer_connector.py run --desktop</code></li></ol><p>{t('setupNetwork')}</p></details>
  </section>
}
