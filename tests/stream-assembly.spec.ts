/**
 * The stream Definition runs inside the host's Conversation assembler, where a
 * throw aborts the whole Session's assembly rather than just the preview. The
 * engine rejects a start Match on a Context that already holds matches, and a
 * replay whose first match is not a start; a history window can begin
 * anywhere (no `turn/start`, a `tool/call` first) and transient chunks arrive
 * and retire around durable events. These specs drive the host's real
 * assembler bundle (the devDependency's; `DSH_UI_CONVERSATION_BUNDLE` points
 * at another host's `lib/client.js`) through those orderings.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STREAM_KEY, streamDefinition } from '../src/client/StreamingPreview.tsx'
import { turnCardsDefinition } from '../src/client/TurnCards.tsx'

interface Assembler {
  replaceWindow(entries: readonly unknown[], hasMore: boolean): unknown
  append(entry: unknown): unknown
  prepend(entries: readonly unknown[], hasMore: boolean): unknown
  settleAssistant(attemptId: string, entry?: unknown): unknown
  flush(): boolean
}

type AssemblerClass = new (events: unknown, views: unknown) => Assembler

/**
 * Evaluate the host's browser bundle with a module-loader shim. Host-only
 * dependencies the assembler never touches resolve to inert stubs.
 * @returns the bundle's `ConversationNodeAssembler`.
 */
function loadAssembler(): AssemblerClass {
  const require = createRequire(import.meta.url)
  const bundle = process.env.DSH_UI_CONVERSATION_BUNDLE
    ?? join(dirname(require.resolve('@deepseek-ai/dsh-client-ui-conversation/package.json')), 'lib/client.js')
  const scope = globalThis as Record<string, unknown>
  const saved = { window: scope.window, loader: scope.__ModuleLoader__ }
  let exported: Record<string, unknown> | undefined
  scope.window = scope
  scope.__ModuleLoader__ = {
    load({ factory }: { factory: (require: (id: string) => unknown) => Record<string, unknown> }) {
      exported = factory((id) => {
        try {
          return require(id) as unknown
        } catch {
          const Stub = function Stub() {}
          return new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : Stub })
        }
      })
    },
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- evaluating the host bundle is the point
    new Function(readFileSync(bundle, 'utf8'))()
  } finally {
    scope.window = saved.window
    scope.__ModuleLoader__ = saved.loader
  }
  return exported?.ConversationNodeAssembler as AssemblerClass
}

const Assembler = loadAssembler()

/** A real assembler with only this plugin's Definitions registered. */
function assemble(): Assembler {
  const definitions = [streamDefinition, turnCardsDefinition]
  return new Assembler(
    { entries: () => definitions, fallbackEntry: () => undefined },
    { entries: () => [] },
  )
}

/** The published stream value of a turn, read from the engine's timeline. */
function streamOf(assembler: Assembler, turn: number): unknown {
  const index = (assembler as unknown as { locationIndex: { snapshot(): { turns: ReadonlyMap<number, { data: { get(key: string): unknown } }> } } }).locationIndex
  return index.snapshot().turns.get(turn)?.data.get(STREAM_KEY)
}

const durable = (seq: number, type: string, data: Record<string, unknown>) =>
  ({ type: 'event', event: { type, seq, time: seq, data } })

const turnStart = (seq: number, turn: number) => durable(seq, 'turn/start', { turn })
const stepStart = (seq: number, turn: number, step: number) => durable(seq, 'step/start', { turn, step })
const toolCall = (seq: number, turn: number, callId: string, name = 'visualize') =>
  durable(seq, 'tool/call', { turn, step: 1, callId, name, arguments: '{}' })

/** A transient chunk sitting between durable seq `after` and the next one. */
const live = (after: number, nth: number, turn: number, chunk: unknown, attemptId = 'a1') => ({
  type: 'transient',
  event: { type: 'assistant/live-chunk', seq: after + 1 - 1 / (nth + 1), time: after, data: { attemptId, turn, step: 1, chunk } },
})

const delta = (index: number, argumentsDelta: string, named?: { id: string; name: string }) =>
  ({ type: 'tool-call-delta', index, id: named?.id ?? '', ...named === undefined ? {} : { name: named.name }, argumentsDelta })

describe('stream Definition inside the real assembler', () => {
  it('survives a window that opens on a tool call before the turn streams again', () => {
    const assembler = assemble()
    // Reconnect to a long turn: the window lost `turn/start`, kept a call.
    assembler.replaceWindow([toolCall(10, 3, 'old')], true)
    assembler.flush()
    expect(() => {
      assembler.append(live(10, 1, 3, delta(0, '{"fragment":"<p', { id: 'v', name: 'visualize' })))
      assembler.flush()
    }).not.toThrow()
  })

  it('survives every arrival order of chunks, calls, settlement, and older pages', () => {
    const assembler = assemble()
    expect(() => {
      assembler.replaceWindow([], true)
      assembler.append(live(20, 1, 4, { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'x', name: 'visualize', arguments: '{}' } }))
      assembler.append(toolCall(21, 4, 'x'))
      assembler.append(live(21, 1, 4, delta(1, '{"fragment":"<b', { id: 'y', name: 'visualize' })))
      assembler.append(live(21, 2, 4, delta(1, 'r>')))
      assembler.flush()
      assembler.settleAssistant('a1')
      assembler.flush()
      assembler.prepend([turnStart(18, 4), stepStart(19, 4, 1)], false)
      assembler.flush()
      assembler.append(toolCall(22, 4, 'y'))
      // Malformed or foreign payloads are ignored, never dereferenced blindly.
      assembler.append(live(22, 1, 4, undefined))
      assembler.append(live(22, 2, Number.NaN, delta(0, '{', { id: 'z', name: 'visualize' })))
      assembler.append(durable(23, 'tool/call', {}))
      assembler.flush()
    }).not.toThrow()
  })

  it('publishes the streaming call on the turn and clears it once the call is logged', () => {
    const assembler = assemble()
    assembler.replaceWindow([turnStart(1, 1), stepStart(2, 1, 1)], false)
    assembler.append(live(2, 1, 1, delta(0, '{"title":"T",', { id: 'v', name: 'visualize' })))
    assembler.append(live(2, 2, 1, delta(0, '"fragment":"<div>')))
    assembler.flush()
    expect(streamOf(assembler, 1)).toEqual({ callId: 'v', argsRaw: '{"title":"T","fragment":"<div>' })
    assembler.append(toolCall(3, 1, 'v'))
    assembler.flush()
    expect(streamOf(assembler, 1)).toBeUndefined()
  })
})
