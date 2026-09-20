/** Wire messages for an outbound desktop connector; screenshots are never durable job records. */
import { z } from 'zod'
import { computerId } from './computer-schema.ts'

const instanceId = z.string().uuid().brand<'ComputerConnectorInstanceId'>()
const frameId = z.string().uuid().brand<'ComputerDesktopFrameId'>()
const inputId = z.string().uuid().brand<'ComputerDesktopInputId'>()
/** Fixed input vocabulary prevents the connector from interpreting shell commands. */
export const desktopInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), button: z.enum(['left', 'right']) }).strict(),
  z.object({ kind: z.literal('key'), key: z.enum(['Return', 'Tab', 'Escape', 'BackSpace', 'Up', 'Down', 'Left', 'Right', 'ctrl+l', 'ctrl+a', 'ctrl+c', 'ctrl+v']) }).strict(),
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(2000) }).strict(),
])
/** A screenshot identifies the observation used to authorize an input. */
export const desktopFrame = z.object({ id: frameId, width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192), png: z.string().min(1) }).strict()
/** Connector identity changes on every process launch. */
export const computerHeartbeat = z.object({
  instanceId, version: z.literal(1), platform: z.string().min(1).max(80), architecture: z.string().min(1).max(80),
  desktop: z.enum(['disabled', 'ready', 'unavailable']), input: z.boolean(),
  frame: desktopFrame.nullable(),
  receipt: z.object({ id: inputId, status: z.enum(['applied', 'failed']) }).strict().nullable(),
}).strict()
/** Browser requests are tied to the current connector and a recent screenshot. */
export const desktopCommand = z.object({ computerId, instanceId, id: inputId, frameId, input: desktopInput }).strict()
/** Server-derived liveness and transient desktop view. */
export const computerConnection = z.object({
  computerId, state: z.enum(['unpaired', 'online', 'offline', 'revoked']),
  lastSeenAt: z.iso.datetime().nullable(), instanceId: instanceId.nullable(),
  platform: z.string(), architecture: z.string(), desktop: z.enum(['disabled', 'ready', 'unavailable']), input: z.boolean(),
  frame: desktopFrame.nullable(), frameAt: z.iso.datetime().nullable(),
  command: z.object({ id: inputId, status: z.enum(['pending', 'dispatched', 'applied', 'failed', 'unknown']) }).nullable(),
})
