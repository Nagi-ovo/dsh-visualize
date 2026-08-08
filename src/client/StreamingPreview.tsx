/**
 * Live streaming preview docked under the composer: while the model is still
 * generating a `visualize` call, the accumulated argument stream
 * (`assistant/chunk` tool-call deltas folded into the conversation snapshot's
 * `partial`) is parsed for the fragment prefix and rendered into the same
 * sandboxed frame the settled card uses — markup and style only, scripts
 * neutered until the call settles (a half-streamed script body is almost
 * never valid JavaScript). Renders nothing when no `visualize` call is
 * streaming; once the call settles the preview unmounts and the transcript
 * card takes over.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the `conversation.input.dock` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { extractStreamingFragment, trimStreamingScripts, VISUALIZE_TOOL_NAME } from '../fragment.ts'
import { buildStreamShellDoc, HEIGHT_MESSAGE_TYPE, STREAM_MESSAGE_TYPE } from '../shell.ts'
import { resolveTheme } from './theme.ts'

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

/**
 * Dock entry: mounts the preview exactly while the streaming partial carries
 * a `visualize` tool-call block.
 */
export function StreamingPreview({ session }: StreamingPreviewProps) {
  // Defensive guard mirroring the official dock rows: a host passing no
  // session must degrade to an empty dock instead of crashing.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const blocks = session?.partial?.blocks
  if (blocks === undefined) return null
  // Last matching block: a turn can contain several visualize calls; only the
  // most recent one can still be streaming.
  let argsRaw: string | undefined
  for (const block of blocks) {
    if (block.kind === 'tool-call' && block.name === VISUALIZE_TOOL_NAME) argsRaw = block.argsRaw
  }
  if (argsRaw === undefined) return null
  return <Preview argsRaw={argsRaw} />
}
