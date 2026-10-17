/**
 * From dsh 0.1.2 the session snapshot carries no streaming partial, so the
 * dock preview reads the `visualize` argument stream from Turn data that the
 * plugin's own Definition folds out of transient `assistant/live-chunk`
 * events. Later deltas of a call may omit its name and id; a durable
 * `tool/call` or a settled block ends or corrects the stream; hosts without a
 * data store must yield no source instead of crashing.
 */

import { describe, expect, it } from 'vitest'
import { latestStreamSource, STREAM_KEY, streamDefinition } from '../src/client/StreamingPreview.tsx'

const TURN_START = { type: 'turn/start', seq: 0, data: { turn: 2 } } as never

/** A live tool-call delta as the session controller emits it. */
function delta(seq: number, index: number, argumentsDelta: string, named?: { id: string; name: string }) {
  return {
    type: 'assistant/live-chunk', seq,
    data: {
      turn: 2, step: 1,
      chunk: { type: 'tool-call-delta', index, id: named?.id ?? '', ...named === undefined ? {} : { name: named.name }, argumentsDelta },
    },
  } as never
}

/**
 * Drive the Definition the way the Conversation engine does for one turn.
 * @param events - events in seq order; the first one that matches as start opens the Context.
 * @returns the published Turn value, or null.
 */
function publish(events: readonly never[]) {
  const def = streamDefinition
  let state: ReturnType<typeof def.start> | undefined
  for (const event of events) {
    const match = def.match(event)
    if (match === null) continue
    state = state === undefined
      ? def.start({} as never, { event, role: match.role } as never, {} as never)
      : def.update({ state } as never, { event, role: match.role } as never)
  }
  return def.buildLocationData!({ state } as never, 'turn', null)
}

describe('stream definition', () => {
  it('claims turn starts, argument chunks, and tool calls only', () => {
    const def = streamDefinition
    expect(def.match(TURN_START)).toEqual({ id: '2', role: 'start' })
    expect(def.match(delta(1, 0, '{'))).toEqual({ id: '2', role: 'start' })
    expect(def.match({ type: 'assistant/live-chunk', seq: 1, data: { turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text: 'x' } } } as never)).toBeNull()
    expect(def.match({ type: 'tool/call', seq: 3, data: { turn: 2, callId: 'v' } } as never)).toEqual({ id: '2', role: 'update' })
    expect(def.match({ type: 'tool/result', seq: 4, data: { turn: 2 } } as never)).toBeNull()
  })

  it('accumulates unnamed continuations onto the named visualize call', () => {
    const value = publish([
      TURN_START,
      delta(1, 0, '{"path":"a"}', { id: 'r', name: 'read' }),
      delta(2, 1, '{"title":"T",', { id: 'v', name: 'visualize' }),
      delta(3, 1, '"fragment":"<div>'),
      delta(4, 0, ''),
    ])
    expect(value).toEqual({ kind: 'turn', turn: 2, key: STREAM_KEY, value: { callId: 'v', argsRaw: '{"title":"T","fragment":"<div>' } })
  })

  it('opens on a mid-turn window without the turn start', () => {
    expect(publish([delta(1, 0, '{"fragment":"<p', { id: 'v', name: 'visualize' })])?.value)
      .toEqual({ callId: 'v', argsRaw: '{"fragment":"<p' })
  })

  it('publishes nothing for other tools, and stops once the call is logged', () => {
    expect(publish([TURN_START, delta(1, 0, '{}', { id: 'r', name: 'read' })])).toBeNull()
    expect(publish([
      TURN_START,
      delta(1, 0, '{"fragment":"<p', { id: 'v', name: 'visualize' }),
      { type: 'tool/call', seq: 2, data: { turn: 2, callId: 'v' } } as never,
    ])).toBeNull()
  })

  it('takes the settled block arguments as authoritative', () => {
    const value = publish([
      TURN_START,
      delta(1, 0, '{"fragment":"<p', { id: 'v', name: 'visualize' }),
      { type: 'assistant/live-chunk', seq: 2, data: { turn: 2, step: 1, chunk: {
        type: 'block-end', index: 0, block: { type: 'tool-call', id: 'v', name: 'visualize', arguments: '{"fragment":"<p>ok</p>"}' },
      } } } as never,
    ])
    expect(value?.value).toEqual({ callId: 'v', argsRaw: '{"fragment":"<p>ok</p>"}' })
  })

  it('publishes Turn data only, reusing the previous value while unchanged', () => {
    const def = streamDefinition
    const state = def.start({} as never, { event: delta(1, 0, '{', { id: 'v', name: 'visualize' }), role: 'start' } as never, {} as never)
    expect(def.buildLocationData!({ state } as never, 'step', null)).toBeNull()
    const first = def.buildLocationData!({ state } as never, 'turn', null)
    expect(def.buildLocationData!({ state } as never, 'turn', first)).toBe(first)
  })
})

describe('stream source lookup', () => {
  it('reads the latest Turn and tolerates hosts without a timeline or data store', () => {
    const source = { getSnapshot: () => undefined, subscribe: () => () => undefined }
    const store = { get: () => undefined, source: (key: string) => key === STREAM_KEY ? source : undefined }
    const timeline = { turnOrder: [1, 2], turns: new Map([[1, { data: {} }], [2, { data: store }]]) } as never
    expect(latestStreamSource(timeline)).toBe(source)
    expect(latestStreamSource(undefined)).toBeUndefined()
    expect(latestStreamSource({ turnOrder: [], turns: new Map() } as never)).toBeUndefined()
    expect(latestStreamSource({ turnOrder: [1], turns: new Map([[1, {}]]) } as never)).toBeUndefined()
  })
})
