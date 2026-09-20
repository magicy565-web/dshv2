/** Profile dialogs retain keyboard focus and return it to the invoking control. */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Contain keyboard navigation within a profile dialog.
 * @param props - Localized title and close label, content, layout and close action.
 * @returns A native modal with focus restoration and a scrollable body.
 */
export function SupplierDialog({ title, closeLabel, className, onClose, children }: {
  title: string; closeLabel: string; className: string; onClose: () => void; children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    const dialog = content.current?.closest<HTMLElement>('[role="dialog"]')
    if (!dialog) return
    const controls = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(element => element.getClientRects().length && !element.closest('fieldset:disabled'))
    controls()[0]?.focus()
    const contain = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = controls()
      const index = items.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus() }
      else if (!event.shiftKey && (index === items.length - 1 || index < 0)) { event.preventDefault(); items[0]?.focus() }
    }
    document.addEventListener('keydown', contain)
    return () => { document.removeEventListener('keydown', contain); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  return <Modal open title={title} closeLabel={closeLabel} className={className} contentClassName="sp-dialog-scroll" onClose={onClose}><div ref={content}>{children}</div></Modal>
}
