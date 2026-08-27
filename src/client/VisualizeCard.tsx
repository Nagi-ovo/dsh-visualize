/**
 * The `visualize` toolview: renders the persisted fragment from the call's
 * durable meta inside `<iframe sandbox="allow-scripts">` with the frame's own
 * CSP. Replay-stable by construction — everything drawn derives from the
 * logged call slice, never from the fragment file.
 *
 * Theme bridge: the card resolves the host's `--dsw-alias-*` design tokens
 * (whale-blue brand accent included) at render time and injects them into the
 * frame document as `--dsh-viz-*` variables; a mutation of the root element's
 * attributes or an OS appearance flip re-resolves them, so the frame follows
 * live theme switches. The frame body stays transparent to blend with the
 * conversation surface.
 *
 * Height: a sandboxed frame's document is unreachable from the parent, so the
 * frame posts its scroll height (tagged with this call's id) and the card
 * sizes the iframe, capped per mode with internal scrolling past the cap.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { visualizeMetaFrom, visualizeMetaFromArgs, type VisualizeMeta } from '../fragment.ts'
import { buildFrameDoc, HEIGHT_MESSAGE_TYPE } from '../shell.ts'
import { resolveTheme } from './theme.ts'

/** Iframe height bounds; content beyond the cap scrolls inside the frame. */
const MIN_HEIGHT = 48
const HEIGHT_CAP: Record<'inline' | 'wide', number> = { inline: 800, wide: 1200 }

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  fontSize: 12,
  opacity: 0.65,
  margin: '2px 0 6px',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
}

const frameStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  border: 0,
  background: 'transparent',
  colorScheme: 'normal',
}

/** First text line of the durable result content, for the error row. */
function firstResultLine(content: readonly { type: string; text?: string }[]): string {
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      const newline = block.text.indexOf('\n')
      return newline === -1 ? block.text : block.text.slice(0, newline)
    }
  }
  return 'visualization failed'
}

/** The settled, well-formed card: header line plus the sandboxed frame. */
function Frame({ meta, callId }: { meta: VisualizeMeta; callId: string }) {
  // Bumped by the observers below; each bump re-resolves the bridged palette.
  const [themeTick, setThemeTick] = useState(0)
  const [height, setHeight] = useState(MIN_HEIGHT)

  useEffect(() => {
    const bump = () => setThemeTick(tick => tick + 1)
    const observer = new MutationObserver(bump)
    // Both mount points: DSH toggles dark via a body attribute, other hosts
    // conventionally re-theme via root-element attributes.
    observer.observe(document.documentElement, { attributes: true })
    observer.observe(document.body, { attributes: true })
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', bump)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', bump)
    }
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data
      if (typeof data !== 'object' || data === null) return
      const report = data as { type?: unknown; token?: unknown; height?: unknown }
      if (report.type !== HEIGHT_MESSAGE_TYPE || report.token !== callId) return
      if (typeof report.height !== 'number' || !Number.isFinite(report.height)) return
      setHeight(Math.max(MIN_HEIGHT, Math.min(Math.ceil(report.height), HEIGHT_CAP[meta.mode])))
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [callId, meta.mode])

  const doc = useMemo(() => {
    const { themeVars, colorScheme } = resolveTheme()
    return buildFrameDoc({
      fragment: meta.fragment,
      title: meta.title,
      themeVars,
      colorScheme,
      reportToken: callId,
    })
    // themeTick is the deliberate re-resolution trigger for the palette read.
  }, [meta, callId, themeTick])

  return (
    <div>
      <div style={headerStyle} title={meta.path === '' ? meta.title : meta.path}>
        <span style={{ fontWeight: 500 }}>{meta.title}</span>
        {meta.path !== '' && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.path}</span>
        )}
      </div>
      <iframe
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        title={meta.title}
        srcDoc={doc}
        style={{ ...frameStyle, height }}
      />
    </div>
  )
}

/**
 * Keyed toolview for the `visualize` tool. Running calls and malformed or
 * failed results stay quiet single lines; a well-formed persisted meta — or
 * the fragment in the call's own arguments for nested dispatches — mounts
 * the frame.
 */
export function VisualizeCard({ callId, block }: ToolCallViewProps) {
  const argsRaw = 'kind' in block ? block.call?.argsRaw : block.argsRaw
  if (!('kind' in block)) {
    const live = visualizeMetaFromArgs(argsRaw)
    if (live !== undefined) return <Frame meta={live} callId={callId} />
    return <div style={headerStyle}>Visualize · rendering…</div>
  }
  if (block.isError) {
    return <div style={headerStyle}>Visualize · {firstResultLine(block.content)}</div>
  }
  const meta = visualizeMetaFrom(block.meta) ?? visualizeMetaFromArgs(argsRaw)
  if (meta === undefined) {
    // A settled call without either the descriptor or a parseable fragment:
    // show the durable result text instead of guessing at markup.
    return <div style={headerStyle}>{firstResultLine(block.content)}</div>
  }
  return <Frame meta={meta} callId={callId} />
}
