# Agent Note: Routine Web surface and Host API

Status: proposed

English | [中文](2026-09-15-routine-web-surface.zh.md)

## Problem

Routine definitions and run records live in the Host-owned SQLite domain, while the first Web client surface can only render a typed `routine` projection. Without a Host Remote API and a global projection, the client cannot list routines, show run history, or perform create, delete, and run-now actions.

## Proposal

Add a Host-owned Routine Remote namespace and a browser-safe projection. Expose `list`, `get`, `create`, `runNow`, and `delete` operations through the existing API gateway. Every request carries the creating Session identity or Routine identity; the Host resolves the owner Agent and filters records so a Web client can only access routines visible to that Session.

Expose only JSON-safe Routine and Run views. The view includes the Routine schedule, next trigger, active/deleted state, and the latest Run summary, status, timestamps, error, and independent Session id. The browser never opens the SQLite file or receives the Agent configuration snapshot.

Complete the `ui-routine` client package as a read-and-action Routine Center. The Session header entry shows active routines and running counts. Its panel supports routine details, recent execution state, immediate execution, deletion, and navigation to the independent execution Session. A create dialog accepts a name, prompt, once or interval plan, and an explicit confirmation that execution starts an independent Session.

Keep the client optional in the Web bundle. The default row remains disabled until the Host Routine provider, Remote namespace, and projection are present in the same profile. Existing Schedule and Jobs surfaces keep their current ownership and behavior.

## Host API and projection

The Remote namespace provides these operations:

```text
routines.list()
routines.get({ routineId })
routines.create({ ownerSessionId, name, prompt, schedule })
routines.runNow({ ownerSessionId, routineId })
routines.delete({ ownerSessionId, routineId })
```

The Host validates ownership before every read or mutation. Missing, deleted, or foreign routines return stable Remote errors. `runNow` creates a manual Run without changing `nextRunAt`. List responses exclude deleted routines by default and include the latest retained Run for each active routine.

The Host publishes a global Routine projection or equivalent Remote-backed observable. The projection refreshes after durable writes and after Run status changes. A missing projection is treated as capability absence; loading and transport failure remain distinct UI states.

## Client behavior

The Routine Center uses the existing header slot, locale service, anchored popover, Session navigation, and semantic theme tokens. The list shows the name, prompt summary, schedule, next run, latest status, and latest completion time. Status dots distinguish active, running, completed, failed, and interrupted states.

The create dialog validates non-empty name and prompt, once timestamps in the future, and interval values at least five minutes. Mutating controls disable while their Remote call is pending and surface stable error text without optimistic durable state. Reconnect refreshes the authoritative list. A cold creator Session can inspect its saved results but is never resumed only to deliver a notification.

## Alternatives considered

**Read SQLite from the browser.** Rejected because it bypasses Host authorization, duplicates storage parsing, and cannot support cold Sessions or remote deployments.

**Represent Routine data as Session events.** Rejected because Routine is Host-owned global state and must remain independent from the existing Session-local Schedule event stream.

**Expose only the four model tools and omit Web controls.** Rejected because users need to inspect schedules and Run outcomes without issuing a model request; the Web surface is a separate read and control path.

## Acceptance criteria

- Web clients list only routines owned by the addressed Session.
- Create, delete, and run-now operations use the Host Remote namespace and preserve Routine scheduling semantics.
- Run status and latest summaries refresh without a page reload after reconnect or completion.
- The Routine Center handles loading, empty, error, running, completed, failed, interrupted, and deleted states.
- A Run links to its independent Session without resuming a cold creator Session.
- Schedule and Jobs behavior remains unchanged.
- Remote, projection, client component, locale, and Web replay tests pass.

## Risks

The global projection can become stale if a provider update bypasses the projection refresh path. The implementation must make durable write completion the refresh trigger and test reconnect baselines. A Remote namespace increases the Host API surface and therefore requires stable ownership errors and bounded Run history data. The first Web version remains single-Host; multi-Host leases, notification outbox, and full Run history pagination stay outside this proposal.
