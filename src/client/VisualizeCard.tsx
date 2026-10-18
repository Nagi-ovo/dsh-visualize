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
 *
 * Open in new window: the header's icon button reopens the same frame
 * document full-size in its own tab, wrapped in a script-free page whose only
 * content is the identically sandboxed iframe (see window-doc.ts).
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { visualizeMetaFrom, visualizeMetaFromArgs, type VisualizeMeta } from '../fragment.ts'
import { buildFrameDoc, HEIGHT_MESSAGE_TYPE } from '../shell.ts'
import { buildWindowDoc, FRAME_SANDBOX } from '../window-doc.ts'
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

/**
 * The card never widens its column: `minWidth: 0` lets the card shrink as a
 * flex or grid item (whose automatic minimum is its min-content width, here
 * the whole no-wrap header), so a long path truncates instead of stretching
 * the frame past the transcript.
 */
const cardStyle: CSSProperties = { minWidth: 0, maxWidth: '100%' }

/** Title keeps its width until it alone fills the row; the path yields first. */
const titleStyle: CSSProperties = {
  fontWeight: 500,
  flexShrink: 0,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const pathStyle: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }

/** Icon button at the header's end; it never yields width to the path. */
const openStyle: CSSProperties = {
  alignSelf: 'center',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  marginLeft: 'auto',
  width: 22,
  height: 22,
  padding: 0,
  border: 0,
  borderRadius: 4,
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  // The header clips its overflow; keep the focus ring inside the button.
  outlineOffset: -2,
}

/**
 * Open the card full-size in its own tab. The tab is a script-free Blob page
 * holding the same sandboxed frame (see window-doc.ts), themed as the host is
 * right now. Synchronous end to end so the browser treats it as a user-opened
 * tab rather than a blocked popup. The URL is not revoked: the tab can then be
 * reloaded, and the browser frees it when the chat page unloads.
 * @param meta - the card to open.
 * @param callId - correlation token base for the frame's height reports.
 */
function openInWindow(meta: VisualizeMeta, callId: string): void {
  const { themeVars, colorScheme } = resolveTheme()
  const frameDoc = buildFrameDoc({
    fragment: meta.fragment,
    title: meta.title,
    themeVars,
    colorScheme,
    // Distinct from the in-chat token, so these reports never size a card.
    reportToken: `window:${callId}`,
  })
  const page = buildWindowDoc({ frameDoc, title: meta.title, colorScheme, background: themeVars.card ?? '' })
  const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }))
  window.open(url, '_blank', 'noopener')
}

/** Accessible name of the open control, in the host's language. */
function openLabel(): string {
  return document.documentElement.lang.toLowerCase().startsWith('zh') ? '在新窗口打开' : 'Open in new window'
}

/** Arrow-out-of-box glyph, sized to the 12px header text. */
function OpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 2.5h4v4" />
      <path d="M13.5 2.5 7.5 8.5" />
      <path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
    </svg>
  )
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
export function Frame({ meta, callId }: { meta: VisualizeMeta; callId: string }) {
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
  const label = openLabel()

  return (
    <div style={cardStyle}>
      <div style={headerStyle} title={meta.path === '' ? meta.title : meta.path}>
        <span style={titleStyle}>{meta.title}</span>
        {meta.path !== '' && <span style={pathStyle}>{meta.path}</span>}
        <button
          type="button"
          style={openStyle}
          aria-label={label}
          title={label}
          onClick={() => openInWindow(meta, callId)}
        >
          <OpenIcon />
        </button>
      </div>
      <iframe
        sandbox={FRAME_SANDBOX}
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
  // dsh 0.1.7 adds a preparing phase whose block carries no arguments yet.
  const argsRaw = 'kind' in block ? block.call?.argsRaw : 'argsRaw' in block ? block.argsRaw : undefined
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
