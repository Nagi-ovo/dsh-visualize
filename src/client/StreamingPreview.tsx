/**
 * Live streaming preview docked under the composer: while the model is still
 * generating a `visualize` call, the accumulated argument stream is parsed for
 * the fragment prefix and rendered into the same sandboxed frame the settled
 * card uses — complete scripts run, a still-open trailing script is held back
 * until its closing tag streams in (a half-streamed script body is almost
 * never valid JavaScript). Renders nothing when no `visualize` call is
 * streaming; once the call settles the preview unmounts and the transcript
 * card takes over.
 *
 * Source: from dsh 0.1.2 the session snapshot no longer carries the streaming
 * partial, and the host's own projections of the argument stream differ per
 * release (0.1.7 folds it into Assistant blocks that publish nothing for a
 * text-less step; 0.2.1 keeps it in the Tool node's lazy argument view). The
 * one shape stable across releases is the transient `assistant/live-chunk`
 * event itself, so a state-only Conversation Definition folds its
 * `tool-call-delta` chunks into Turn data, and the dock entry reads the open
 * Turn's value through the session-standard Chat selector. dsh 0.1.1 still
 * has the snapshot partial and no registry, and keeps reading it.
 */

import {
  useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties,
} from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ConversationLocationData, ConversationLocationDataSource, ConversationNodeDefinition,
  ConversationTimelineSnapshot,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the `conversation.input.dock` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the session-standard `useChat` selector declaration.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { extractStreamingFragment, trimStreamingScripts, VISUALIZE_TOOL_NAME } from '../fragment.ts'
import { buildStreamShellDoc, HEIGHT_MESSAGE_TYPE, STREAM_MESSAGE_TYPE } from '../shell.ts'
import { resolveTheme } from './theme.ts'
import { liveStyle } from './style.ts'

/** Definition kind and Turn data key; namespaced by package to stay unique. */
export const STREAM_KEY = 'dsh-visualize-stream'

/** The `visualize` call still streaming in a Turn. */
export interface VisualizeStreamData {
  readonly callId: string
  readonly argsRaw: string
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** The Turn's still-streaming `visualize` call, absent when none streams. */
    'dsh-visualize-stream': VisualizeStreamData
  }
}

/** One streamed tool-call block, addressed by its step and content index. */
interface StreamedCall {
  readonly slot: string
  readonly callId: string
  readonly name: string
  readonly argsRaw: string
}

interface StreamState {
  readonly turn: number
  /** Unsettled calls in stream order. */
  readonly calls: readonly StreamedCall[]
}

/** One argument chunk, already checked: `final` marks a settled block's full text. */
interface CallChunk {
  readonly step: number
  readonly index: number
  readonly id: string
  readonly name: string | undefined
  readonly text: string
  readonly final: boolean
}

/** What one accepted event means to the fold. */
type StreamInput =
  | { readonly kind: 'turn'; readonly turn: number }
  | { readonly kind: 'chunk'; readonly turn: number; readonly chunk: CallChunk }
  | { readonly kind: 'call'; readonly turn: number; readonly callId: string }

const isIndex = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const idOf = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : ''

/**
 * Read an argument chunk (dsh-llm `StreamChunk`): a `tool-call-delta`, or the
 * `block-end` of a tool-call block.
 * @param chunk - the live chunk, unchecked.
 * @param step - the chunk's step.
 * @returns the checked chunk, or undefined for anything else or malformed.
 */
function callChunk(chunk: unknown, step: number): CallChunk | undefined {
  if (!isRecord(chunk) || !isIndex(chunk.index)) return undefined
  if (chunk.type === 'tool-call-delta') {
    return {
      step, index: chunk.index, id: idOf(chunk.id),
      name: typeof chunk.name === 'string' ? chunk.name : undefined,
      text: typeof chunk.argumentsDelta === 'string' ? chunk.argumentsDelta : '',
      final: false,
    }
  }
  const block = chunk.block
  if (chunk.type !== 'block-end' || !isRecord(block) || block.type !== 'tool-call') return undefined
  if (typeof block.arguments !== 'string') return undefined
  return {
    step, index: chunk.index, id: idOf(block.id),
    name: typeof block.name === 'string' ? block.name : undefined,
    text: block.arguments,
    final: true,
  }
}

/**
 * Classify an event without trusting its payload: a history window can begin
 * anywhere and a host may change shapes, and a throw here would abort the
 * host's whole conversation assembly, not just this preview.
 * @param event - any Session event the engine offers.
 * @returns the fold input, or undefined when unrelated or malformed.
 */
function streamInput(event: { readonly type: string; readonly data?: unknown }): StreamInput | undefined {
  const data = event.data
  if (!isRecord(data) || !isIndex(data.turn)) return undefined
  const turn = data.turn
  if (event.type === 'turn/start') return { kind: 'turn', turn }
  if (event.type === 'tool/call') return { kind: 'call', turn, callId: idOf(data.callId) }
  if (event.type !== 'assistant/live-chunk' || !isIndex(data.step)) return undefined
  const chunk = callChunk(data.chunk, data.step)
  return chunk === undefined ? undefined : { kind: 'chunk', turn, chunk }
}

/**
 * Fold one argument chunk. Later deltas of a call may omit its name and id,
 * so a call is addressed by step and content index, the way the provider
 * stream addresses it; a settled block replaces the accumulated text with
 * the authoritative arguments.
 * @param calls - calls so far.
 * @param chunk - the checked chunk.
 * @returns the next call list.
 */
function foldChunk(calls: readonly StreamedCall[], chunk: CallChunk): readonly StreamedCall[] {
  const slot = `${chunk.step}:${chunk.index}`
  const at = calls.findIndex(call => call.slot === slot)
  const previous = at === -1 ? undefined : calls[at]
  const next: StreamedCall = {
    slot,
    callId: previous?.callId || chunk.id,
    name: chunk.name ?? previous?.name ?? '',
    argsRaw: chunk.final ? chunk.text : (previous?.argsRaw ?? '') + chunk.text,
  }
  return at === -1 ? [...calls, next] : calls.map((call, index) => index === at ? next : call)
}

/**
 * Apply one event. Total: unrelated or malformed input returns the state.
 * @param state - state so far.
 * @param event - the matched event.
 * @returns the next state.
 */
function reduceStream(state: StreamState, event: { readonly type: string; readonly data?: unknown }): StreamState {
  const input = streamInput(event)
  if (input?.kind === 'chunk') return { ...state, calls: foldChunk(state.calls, input.chunk) }
  if (input?.kind !== 'call') return state
  const calls = state.calls.filter(call => call.callId !== input.callId)
  return calls.length === state.calls.length ? state : { ...state, calls }
}

/**
 * Turn-local fold of the argument stream; it publishes Turn data and no view
 * Node. Live chunks are transient: when the Assistant message settles the
 * engine retires them and replays the Context without them, which empties the
 * value on its own; a durable `tool/call` also settles its call.
 *
 * Every accepted event is a start candidate. The engine rejects a start that
 * arrives on a Context already holding matches, and a history window can
 * begin at any event of a turn (a long turn loses its `turn/start`, keeps a
 * `tool/call`, and then streams again), so no event may be an update-only
 * match; the earliest loaded one opens the Context and the rest fold.
 */
export const streamDefinition: ConversationNodeDefinition<StreamState> = {
  kind: STREAM_KEY,
  match: (event) => {
    const input = streamInput(event)
    return input === undefined ? null : { id: String(input.turn), role: 'start' }
  },
  start: (_context, match) => {
    const input = streamInput(match.event)
    return reduceStream({ turn: input?.turn ?? 0, calls: [] }, match.event)
  },
  update: (context, match) => reduceStream(context.state, match.event),
  publication: match => match.event.type === 'assistant/live-chunk' ? 'animation-frame' : 'immediate',
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    const { turn, calls } = context.state
    // Last matching call: a turn can contain several visualize calls; only the
    // most recent one can still be streaming.
    let call: StreamedCall | undefined
    for (const candidate of calls) if (candidate.name === VISUALIZE_TOOL_NAME) call = candidate
    if (call === undefined) return null
    if (previous?.kind === 'turn' && previous.turn === turn && previous.key === STREAM_KEY
      && previous.value.callId === call.callId && previous.value.argsRaw === call.argsRaw) return previous
    return {
      kind: 'turn', turn, key: STREAM_KEY, value: { callId: call.callId, argsRaw: call.argsRaw },
    } satisfies ConversationLocationData
  },
}

/** Dock entry props: the InputZone owner share (live conversation snapshot). */
type StreamingPreviewProps = PropsRuntime<'conversation.input.dock'>

/**
 * Flush interval for posting fragment updates into the persistent shell.
 * Updates are incremental DOM syncs, not reloads, so this can run near
 * per-delta speed; 150ms keeps the reveal continuous at negligible cost.
 */
const FLUSH_MS = 150

/**
 * Preview height ceiling. The frame tracks the shell's *measured* content
 * height (its height reports), so invisible early markup — style blocks,
 * empty containers — keeps the frame collapsed and painted components grow
 * it; the cap stops a tall fragment from crowding out the composer. Reserving
 * space no paint has claimed reads as a layout bug, not as anticipation.
 */
const PREVIEW_MAX_HEIGHT = 300

/**
 * The input dock spans the conversation view, not the composer column, so the
 * preview constrains itself to the composer's width family and centers.
 */
const wrapStyle: CSSProperties = { margin: '6px auto 2px', maxWidth: 760, width: '100%' }

const labelStyle: CSSProperties = {
  fontSize: 12,
  opacity: 0.65,
  margin: '0 0 4px',
}

const frameStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  border: 0,
  background: 'transparent',
  transition: 'height 240ms ease',
}

/**
 * Throttle a fast-changing string: re-emits at most every {@link FLUSH_MS},
 * with a trailing flush so the final value always lands. A plain trailing
 * debounce would starve under a continuous token stream — every delta would
 * reset the timer — so this flushes on the leading edge when the interval has
 * already elapsed.
 * @param value - the raw per-render value.
 * @returns the throttled value.
 */
function useThrottled(value: string): string {
  const [shown, setShown] = useState(value)
  const lastFlush = useRef(0)
  useEffect(() => {
    const elapsed = Date.now() - lastFlush.current
    if (elapsed >= FLUSH_MS) {
      lastFlush.current = Date.now()
      setShown(value)
      return
    }
    const timer = setTimeout(() => {
      lastFlush.current = Date.now()
      setShown(value)
    }, FLUSH_MS - elapsed)
    return () => clearTimeout(timer)
  }, [value])
  return shown
}

/** The mounted preview, split out so hooks only run while a call streams. */
function Preview({ argsRaw }: { argsRaw: string }) {
  const throttled = useThrottled(argsRaw)
  const fragment = extractStreamingFragment(throttled)
  const preview = fragment === undefined ? '' : trimStreamingScripts(fragment)
  const hasContent = preview.trim().length > 0
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  // Follow the shell's height reports so the frame hugs what is actually
  // painted; the CSS transition turns each growth step into a smooth reveal.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const report = event.data as { type?: unknown; token?: unknown; height?: unknown } | null
      if (report?.type !== HEIGHT_MESSAGE_TYPE || report.token !== 'streaming-preview') return
      if (typeof report.height !== 'number' || !Number.isFinite(report.height)) return
      setContentHeight(Math.max(0, Math.ceil(report.height)))
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [])
  // The shell loads ONCE per streaming call; updates flow over postMessage
  // and sync incrementally, so unchanged components persist and new ones
  // float in instead of the whole frame reloading per flush.
  const doc = useMemo(() => buildStreamShellDoc({
    ...resolveTheme(),
    reportToken: 'streaming-preview',
    style: liveStyle(),
  }), [])
  useEffect(() => {
    if (!loaded || !hasContent) return
    frameRef.current?.contentWindow?.postMessage({
      type: STREAM_MESSAGE_TYPE,
      token: 'streaming-preview',
      fragment: preview,
    }, '*')
  }, [loaded, hasContent, preview])
  return (
    <div style={wrapStyle}>
      <div style={labelStyle}>
        {hasContent ? 'Visualize · streaming preview' : 'Visualize · composing…'}
      </div>
      <iframe
        ref={frameRef}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        title="Visualization streaming preview"
        srcDoc={doc}
        style={{ ...frameStyle, height: hasContent ? Math.min(contentHeight, PREVIEW_MAX_HEIGHT) : 0 }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

/** The open Turn's stream source, or undefined when the host has none. */
type StreamSource = ConversationLocationDataSource<Readonly<VisualizeStreamData> | undefined>

const NO_SOURCE: StreamSource = { getSnapshot: () => undefined, subscribe: () => () => undefined }

/**
 * The latest Turn's stream source. A Location's data store is observable on
 * its own, so the Chat selector only tracks which Turn is latest and every
 * argument delta reaches the preview without re-reading the Chat snapshot.
 * @param timeline - the Chat target's Turn/Step facts; older hosts may omit it.
 * @returns the source, or undefined before any Turn or without a data store.
 */
export function latestStreamSource(timeline: ConversationTimelineSnapshot | undefined): StreamSource | undefined {
  const turn = timeline?.turnOrder.at(-1)
  const location = turn === undefined ? undefined : timeline?.turns.get(turn)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- feature-detect the data store
  return typeof location?.data?.source === 'function' ? location.data.source(STREAM_KEY) : undefined
}

/** Dock body on hosts with the Conversation registry (dsh 0.1.2+). */
function TurnStream({ useChat }: { useChat: StreamingPreviewProps['useChat'] }) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- a host may publish no Chat snapshot yet
  const source = useChat(snapshot => latestStreamSource(snapshot?.timeline)) ?? NO_SOURCE
  const stream = useSyncExternalStore(source.subscribe, source.getSnapshot)
  if (stream === undefined) return null
  // Keyed by call: a second visualize call in the same turn gets a fresh shell.
  return <Preview key={stream.callId} argsRaw={stream.argsRaw} />
}

/** The slice of a dsh 0.1.1 session snapshot the legacy path reads. */
interface LegacyPartial {
  readonly partial?: { readonly blocks?: readonly { kind?: string; name?: string; argsRaw?: string }[] } | null
}

/**
 * Dock entry: mounts the preview exactly while a `visualize` call streams.
 */
export function StreamingPreview({ session, useChat }: StreamingPreviewProps) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent on dsh 0.1.1
  if (typeof useChat === 'function') return <TurnStream useChat={useChat} />
  // dsh 0.1.1: the streaming partial still rides on the session snapshot.
  // Defensive guard mirroring the official dock rows: a host passing no
  // session must degrade to an empty dock instead of crashing.
  const blocks = (session as LegacyPartial | undefined)?.partial?.blocks
  if (blocks === undefined) return null
  let argsRaw: string | undefined
  for (const block of blocks) {
    if (block.kind === 'tool-call' && block.name === VISUALIZE_TOOL_NAME) argsRaw = block.argsRaw
  }
  if (argsRaw === undefined) return null
  return <Preview argsRaw={argsRaw} />
}
