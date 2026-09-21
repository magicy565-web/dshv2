/** Countdown and elapsed formatting pick distance-appropriate granularity. */
import { describe, expect, it } from 'vitest'
import { formatElapsed, formatMoney, formatRemaining, sparklinePoints } from '../src/workbench-ui.tsx'

const labels = { day: '天', hour: '小时', minute: '分钟', second: '秒' }

describe('formatRemaining', () => {
  it('shows days beyond 48 hours', () => {
    expect(formatRemaining(85 * 86400000, labels)).toEqual([{ value: '85', unit: '天' }])
  })
  it('shows hours and padded minutes within two days', () => {
    expect(formatRemaining(3 * 3600000 + 12 * 60000, labels)).toEqual([{ value: '3', unit: '小时' }, { value: '12', unit: '分钟' }])
  })
  it('shows padded minutes and seconds within the hour', () => {
    expect(formatRemaining(9 * 60000 + 5000, labels)).toEqual([{ value: '09', unit: '分钟' }, { value: '05', unit: '秒' }])
  })
  it('clamps overdue durations to zero', () => {
    expect(formatRemaining(-1000, labels)).toEqual([{ value: '00', unit: '分钟' }, { value: '00', unit: '秒' }])
  })
})

describe('formatElapsed', () => {
  it('shows mm:ss within the hour', () => {
    expect(formatElapsed(3 * 60000 + 42000)).toBe('03:42')
  })
  it('shows h:mm:ss beyond the hour', () => {
    expect(formatElapsed(3600000 + 12 * 60000 + 9000)).toBe('1:12:09')
  })
  it('clamps negative durations to zero', () => {
    expect(formatElapsed(-5)).toBe('00:00')
  })
})

describe('sparklinePoints', () => {
  it('maps values into the padded frame with the peak at the top', () => {
    const points = sparklinePoints([3, 9, 6], 100, 20).split(' ')
    expect(points).toHaveLength(3)
    const [first, peak, last] = points.map(point => point.split(',').map(Number))
    expect(first[0]).toBeCloseTo(2)
    expect(last[0]).toBeCloseTo(98)
    expect(peak[1]).toBeCloseTo(2)
    expect(first[1]).toBeCloseTo(18)
  })
  it('centers a constant series instead of dividing by zero', () => {
    expect(sparklinePoints([5, 5, 5], 100, 20).split(' ').map(point => Number(point.split(',')[1]))).toEqual([10, 10, 10])
  })
  it('returns nothing for a single point', () => {
    expect(sparklinePoints([4], 100, 20)).toBe('')
  })
})

describe('formatMoney', () => {
  it('formats USD in English locale', () => {
    expect(formatMoney(12800, 'USD', 'en-US')).toBe('$12,800.00')
  })
  it('formats CNY in Chinese locale', () => {
    expect(formatMoney(12800, 'CNY', 'zh-CN')).toBe('¥12,800.00')
  })
})
