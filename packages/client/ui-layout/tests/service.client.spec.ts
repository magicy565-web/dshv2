import { describe, expect, it, vi } from 'vitest'
import { LayoutController } from '../src/client/service.ts'
import type { MainPanelId, PanelActions } from '../src/client/service.ts'

function fakePanels(): PanelActions {
  return {
    selectPanel: vi.fn(),
    retainMainPanels: vi.fn(),
    setSidebar: vi.fn(),
    toggleSidebar: vi.fn(),
    setViewportWidth: vi.fn(),
    setRightbar: vi.fn(),
    openRightbar: vi.fn(),
    closeRightbar: vi.fn(),
  }
}

describe('LayoutController', () => {
  it('forwards right column transitions to the constructor-supplied actions', () => {
    const panels = fakePanels()
    const service = new LayoutController(panels, () => true)

    service.openRightbar(true, false)
    service.openRightbar(true, true)
    service.openRightbar(false, true)
    service.closeRightbar()

    expect(panels.openRightbar).toHaveBeenNthCalledWith(1, true, false)
    expect(panels.openRightbar).toHaveBeenNthCalledWith(2, true, true)
    expect(panels.openRightbar).toHaveBeenNthCalledWith(3, false, true)
    expect(panels.closeRightbar).toHaveBeenCalledTimes(1)
    // The drag width stays the frame's own business, never the caller's.
    expect(panels.setRightbar).not.toHaveBeenCalled()
  })

  it('can toggle the sidebar immediately after construction', () => {
    const panels = fakePanels()
    const service = new LayoutController(panels, () => true)

    service.toggleSidebar()

    expect(panels.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(panels.setSidebar).not.toHaveBeenCalled()
  })

  it('forwards panel selection and returning to the Conversation without changing geometry', () => {
    const panels = fakePanels()
    const service = new LayoutController(panels, () => true)
    const panelId = 'panel-a' as MainPanelId
    service.selectPanel(panelId)
    service.selectPanel(panelId)
    service.selectPanel(null)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(1, panelId)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(2, panelId)
    expect(panels.selectPanel).toHaveBeenNthCalledWith(3, null)
    expect(panels.toggleSidebar).not.toHaveBeenCalled()
    expect(panels.openRightbar).not.toHaveBeenCalled()
    expect(panels.closeRightbar).not.toHaveBeenCalled()
  })

  it('keeps separately constructed controllers bound to their own instances', () => {
    const first = fakePanels()
    const second = fakePanels()
    const firstService = new LayoutController(first, () => true)
    const secondService = new LayoutController(second, () => true)
    firstService.toggleSidebar()
    expect(first.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(second.toggleSidebar).not.toHaveBeenCalled()
    secondService.closeRightbar()
    expect(first.closeRightbar).not.toHaveBeenCalled()
    expect(second.closeRightbar).toHaveBeenCalledTimes(1)
  })

  it('rejects an absent main entry without changing selection or cancelling pending navigation', () => {
    const panels = fakePanels()
    const present = new Set(['panel-a'])
    const service = new LayoutController(panels, id => present.has(id))
    service.selectPanel('panel-a' as MainPanelId)
    const navigation = service.beginNavigation()
    present.delete('panel-a')
    expect(() => { service.selectPanel('panel-a' as MainPanelId) }).toThrow('main panel "panel-a" is not registered')
    expect(panels.selectPanel).toHaveBeenCalledOnce()
    expect(navigation.aborted).toBe(false)
    service.selectPanel(null)
    expect(navigation.aborted).toBe(true)
  })

  it('supersedes asynchronous navigation on another request, any valid selection, and disposal', () => {
    const service = new LayoutController(fakePanels(), () => true)
    const first = service.beginNavigation()
    const second = service.beginNavigation()
    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
    service.selectPanel('panel-a' as MainPanelId)
    expect(second.aborted).toBe(true)
    const repeated = service.beginNavigation()
    service.selectPanel('panel-a' as MainPanelId)
    expect(repeated.aborted).toBe(true)
    const pending = service.beginNavigation()
    service.dispose()
    expect(pending.aborted).toBe(true)
    service.dispose()
  })

  it('retains selection and pending navigation until guards allow leaving', () => {
    const panels = fakePanels()
    const service = new LayoutController(panels, id => id === 'editor')
    service.selectPanel('editor' as MainPanelId)
    const pending = service.beginNavigation()
    const first = vi.fn(() => false)
    const second = vi.fn(() => true)
    const release = service.registerPanelGuard(first)
    service.registerPanelGuard(second)
    service.selectPanel(null)
    expect(first).toHaveBeenCalledWith(null)
    expect(second).not.toHaveBeenCalled()
    expect(panels.selectPanel).toHaveBeenCalledOnce()
    expect(pending.aborted).toBe(false)
    expect(() => { service.selectPanel('missing' as MainPanelId) }).toThrow('not registered')
    expect(first).toHaveBeenCalledOnce()
    release()
    release()
    service.selectPanel(null)
    expect(second).toHaveBeenCalledWith(null)
    expect(panels.selectPanel).toHaveBeenLastCalledWith(null)
    expect(pending.aborted).toBe(true)
  })

  it('releases duplicate guard registrations independently and clears them on disposal', () => {
    const panels = fakePanels()
    const service = new LayoutController(panels, () => true)
    const guard = vi.fn(() => false)
    const releaseFirst = service.registerPanelGuard(guard)
    const releaseSecond = service.registerPanelGuard(guard)
    releaseFirst()
    service.selectPanel(null)
    expect(panels.selectPanel).not.toHaveBeenCalled()
    service.dispose()
    releaseSecond()
    service.selectPanel(null)
    expect(guard).toHaveBeenCalledOnce()
    expect(panels.selectPanel).toHaveBeenCalledWith(null)
  })
})
