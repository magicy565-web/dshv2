/** Ephemeral desktop relay. Restart, credential rotation and expiry invalidate desktop control. */
import { Buffer } from 'node:buffer'
import { z } from 'zod'
import { ComputerError } from './computer-store.ts'
import { computerId } from './computer-schema.ts'
import { computerHeartbeat, desktopCommand, computerConnection } from './computer-remote-schema.ts'

type Heartbeat = z.infer<typeof computerHeartbeat>
type Command = z.infer<typeof desktopCommand>
type Connection = z.infer<typeof computerConnection>
type Entry = { heartbeat: Heartbeat; seen: number; frameAt: number | null; viewed: number; command: Command | null; status: NonNullable<Connection['command']>['status']; inputIds: Set<string> }

/** Construct a relay scoped to one Host lifetime.
 * @param options - Deployment limits and the Host clock.
 * @returns Validated heartbeat, view and input operations; callers must authenticate each request.
 */
export function computerRemote(options: { offlineMs: number; viewMs: number; commandMs: number; maxFrameBytes: number; now?: () => number }) {
  const now = options.now ?? Date.now
  const entries = new Map<string, Entry>()
  const demand = new Map<string, number>()
  const commandTimes = new Map<string, number>()
  const expire = (id: string) => {
    const entry = entries.get(id)
    if (!entry) return
    if (now() - entry.seen >= options.offlineMs || now() - entry.viewed >= options.viewMs) { entry.heartbeat.frame = null; entry.frameAt = null }
    if (entry.command && ['pending', 'dispatched'].includes(entry.status) && now() - (commandTimes.get(id) ?? 0) >= options.commandMs) entry.status = 'unknown'
  }
  const view = (id: string, enabled: boolean, watch = false): Connection => {
    expire(id)
    const entry = entries.get(id)
    if (watch && enabled) { demand.set(id, now()); if (entry) entry.viewed = now() }
    const online = enabled && !!entry && now() - entry.seen < options.offlineMs
    return {
      computerId: computerId.parse(id), state: !enabled ? 'revoked' : !entry ? 'unpaired' : online ? 'online' : 'offline',
      lastSeenAt: entry ? new Date(entry.seen).toISOString() : null, instanceId: entry?.heartbeat.instanceId ?? null,
      platform: entry?.heartbeat.platform ?? '', architecture: entry?.heartbeat.architecture ?? '',
      desktop: entry?.heartbeat.desktop ?? 'disabled', input: online && (entry?.heartbeat.input ?? false),
      frame: online && watch ? entry!.heartbeat.frame : null, frameAt: entry?.frameAt == null ? null : new Date(entry.frameAt).toISOString(),
      command: entry?.command ? { id: entry.command.id, status: entry.status } : null,
    }
  }
  return {
    view,
    reset(id: string) { entries.delete(id); demand.delete(id); commandTimes.delete(id) },
    heartbeat(id: string, input: Heartbeat) {
      expire(id)
      const previous = entries.get(id)
      if (previous && previous.heartbeat.instanceId !== input.instanceId && now() - previous.seen < options.offlineMs) throw new ComputerError(409, 'connectorInUse')
      if (input.frame) {
        const bytes = Buffer.from(input.frame.png, 'base64')
        if (bytes.length > options.maxFrameBytes || bytes.length < 24 || bytes.toString('base64') !== input.frame.png || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== input.frame.width || bytes.readUInt32BE(20) !== input.frame.height) throw new ComputerError(400, 'invalidFrame')
        if (input.desktop !== 'ready') throw new ComputerError(400, 'invalidFrame')
      }
      const same = previous?.heartbeat.instanceId === input.instanceId
      const entry: Entry = same ? previous : { heartbeat: input, seen: now(), frameAt: null, viewed: demand.get(id) ?? -Infinity, command: null, status: 'unknown', inputIds: new Set() }
      const capture = now() - (demand.get(id) ?? -Infinity) < options.viewMs
      if (same && input.frame?.id === entry.heartbeat.frame?.id) throw new ComputerError(409, 'repeatedFrame')
      entry.heartbeat = { ...input, frame: capture ? input.frame : null }
      entry.seen = now(); entry.frameAt = entry.heartbeat.frame ? now() : null
      if (input.receipt && entry.command?.id === input.receipt.id && entry.status === 'dispatched') entry.status = input.receipt.status
      let command: Command | null = null
      if (entry.command && entry.status === 'pending') {
        if (input.desktop === 'ready' && input.input && capture) { command = entry.command; entry.status = 'dispatched' }
        else entry.status = 'failed'
      }
      entries.set(id, entry)
      return { capture, command }
    },
    enqueue(input: Command) {
      expire(input.computerId)
      const entry = entries.get(input.computerId)
      if (!entry || now() - entry.seen >= options.offlineMs || entry.heartbeat.instanceId !== input.instanceId) throw new ComputerError(409, 'offline')
      if (entry.command?.id === input.id) {
        if (JSON.stringify(entry.command) !== JSON.stringify(input)) throw new ComputerError(409, 'conflict')
        return view(input.computerId, true)
      }
      if (entry.inputIds.has(input.id)) throw new ComputerError(409, 'supersededInput')
      // Version 1 bounds deduplication storage on both sides; a new instance starts a new input session.
      if (entry.inputIds.size >= 10000) throw new ComputerError(409, 'reconnectRequired')
      if (entry.command && ['pending', 'dispatched', 'unknown'].includes(entry.status)) throw new ComputerError(409, 'inputUnconfirmed')
      const frame = entry.heartbeat.frame
      if (!entry.heartbeat.input || !frame || frame.id !== input.frameId || entry.frameAt === null || now() - entry.frameAt >= options.viewMs) throw new ComputerError(409, 'staleFrame')
      if (input.input.kind === 'click' && (input.input.x >= frame.width || input.input.y >= frame.height)) throw new ComputerError(400, 'invalidCoordinates')
      entry.inputIds.add(input.id); entry.command = input; entry.status = 'pending'; commandTimes.set(input.computerId, now())
      return view(input.computerId, true)
    },
  }
}
