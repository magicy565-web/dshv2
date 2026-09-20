/** Desktop control refuses stale observations, duplicate dispatch and credential/session replacement. */
import { randomUUID } from 'node:crypto'
import { test, expect } from 'vitest'
import { computerRemote } from '../src/computer-remote.ts'
import { computerHeartbeat, desktopCommand } from '../src/computer-remote-schema.ts'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII='
function fixture() {
  let time = 100000
  const relay = computerRemote({ offlineMs: 20000, viewMs: 10000, commandMs: 5000, maxFrameBytes: 1000, now: () => time })
  const id = randomUUID()
  const heartbeat = () => computerHeartbeat.parse({ instanceId: instance, version: 1, platform: 'Linux', architecture: 'x86_64', desktop: 'ready', input: true, frame: { id: randomUUID(), png, width: 1, height: 1 }, receipt: null })
  const instance = randomUUID()
  const command = (frameId: string) => desktopCommand.parse({ computerId: id, instanceId: instance, id: randomUUID(), frameId, input: { kind: 'click', x: 0, y: 0, button: 'left' } })
  return { relay, id, heartbeat, command, advance: (ms: number) => { time += ms } }
}

test('online requires heartbeat and expired views stop retaining screenshots', () => {
  const f = fixture()
  expect(f.relay.view(f.id, true).state).toBe('unpaired')
  const beat = f.heartbeat()
  expect(f.relay.heartbeat(f.id, beat).capture).toBe(false)
  expect(f.relay.view(f.id, true, true).frame).toBeNull()
  f.relay.heartbeat(f.id, f.heartbeat())
  expect(f.relay.view(f.id, true, true).frame).not.toBeNull()
  f.advance(10001)
  expect(f.relay.view(f.id, true, true).frame).toBeNull()
  f.advance(10000)
  expect(f.relay.view(f.id, true).state).toBe('offline')
  expect(f.relay.view(f.id, false).state).toBe('revoked')
})

test('an input is dispatched once and a missing receipt blocks new inputs', () => {
  const f = fixture()
  f.relay.view(f.id, true, true)
  const beat = f.heartbeat(); f.relay.heartbeat(f.id, beat)
  const command = f.command(beat.frame!.id)
  f.relay.enqueue(command)
  expect(() => f.relay.enqueue({ ...command, input: { kind: 'key', key: 'Return' } })).toThrow('conflict')
  expect(f.relay.heartbeat(f.id, f.heartbeat()).command).toEqual(command)
  expect(f.relay.heartbeat(f.id, f.heartbeat()).command).toBeNull()
  f.advance(5000)
  expect(f.relay.view(f.id, true).command?.status).toBe('unknown')
  expect(() => f.relay.enqueue(f.command(beat.frame!.id))).toThrow('inputUnconfirmed')
})

test('receipts release input while changed instances and malformed frames are refused', () => {
  const f = fixture(); f.relay.view(f.id, true, true)
  const beat = f.heartbeat(); f.relay.heartbeat(f.id, beat)
  const command = f.command(beat.frame!.id); f.relay.enqueue(command)
  f.relay.heartbeat(f.id, f.heartbeat())
  const next = f.heartbeat()
  next.receipt = { id: command.id, status: 'applied' }; f.relay.heartbeat(f.id, next)
  expect(f.relay.view(f.id, true).command?.status).toBe('applied')
  expect(() => f.relay.heartbeat(f.id, computerHeartbeat.parse({ ...f.heartbeat(), instanceId: randomUUID() }))).toThrow('connectorInUse')
  expect(() => f.relay.enqueue(f.command(beat.frame!.id))).toThrow('staleFrame')
  const outside = f.command(next.frame!.id); outside.input = { kind: 'click', x: 1, y: 0, button: 'left' }
  expect(() => f.relay.enqueue(outside)).toThrow('invalidCoordinates')
  const bad = f.heartbeat(); bad.frame!.width = 2
  expect(() => f.relay.heartbeat(f.id, bad)).toThrow('invalidFrame')
  f.relay.enqueue(f.command(next.frame!.id))
  expect(() => f.relay.enqueue(command)).toThrow('supersededInput')
  f.relay.reset(f.id)
  expect(() => f.relay.enqueue(command)).toThrow('offline')
  expect(f.relay.view(f.id, true).state).toBe('unpaired')
})

test('closed viewers and unavailable input devices cannot dispatch a pending action', () => {
  const f = fixture(); f.relay.view(f.id, true, true)
  const beat = f.heartbeat(); f.relay.heartbeat(f.id, beat)
  f.relay.enqueue(f.command(beat.frame!.id))
  const unavailable = { ...f.heartbeat(), desktop: 'unavailable' as const, input: false, frame: null }
  expect(f.relay.heartbeat(f.id, unavailable).command).toBeNull()
  expect(f.relay.view(f.id, true).command?.status).toBe('failed')
})
