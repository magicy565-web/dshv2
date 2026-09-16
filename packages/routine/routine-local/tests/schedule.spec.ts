import { describe, expect, it } from 'vitest'
import { MIN_INTERVAL_SECONDS, resolveIntervalNext } from '../src/index.ts'

describe('Routine interval scheduling', () => {
  it('advances to the first anchor-aligned occurrence after the decision time', () => {
    const schedule = { kind: 'interval' as const, everySeconds: MIN_INTERVAL_SECONDS, anchorAt: '2026-09-15T00:00:00.000Z' }
    expect(resolveIntervalNext(schedule, Date.parse('2026-09-15T00:11:00.000Z'))).toBe('2026-09-15T00:15:00.000Z')
  })

  it('keeps an occurrence in the future when the decision is before the anchor', () => {
    const schedule = { kind: 'interval' as const, everySeconds: MIN_INTERVAL_SECONDS, anchorAt: '2026-09-15T01:00:00.000Z' }
    expect(resolveIntervalNext(schedule, Date.parse('2026-09-15T00:59:00.000Z'))).toBe('2026-09-15T01:00:00.000Z')
  })
})
