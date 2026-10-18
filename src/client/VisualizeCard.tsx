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
 *
 * Page mode: a `page` card is built for a whole browser tab, so the chat shows
 * a launcher instead — title, summary, a live but inert thumbnail of the page
 * laid out at desktop width and scaled into the card, and a button that opens
 * the page through the same script-free wrapper. A secondary toggle shows the
 * page in the conversation, for browsers or hosts that will not open a tab.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { visualizeMetaFrom, visualizeMetaFromArgs, type VisualizeMeta } from '../fragment.ts'
import { buildFrameDoc, HEIGHT_MESSAGE_TYPE, type FrameVariant } from '../shell.ts'
import { buildWindowDoc, FRAME_SANDBOX } from '../window-doc.ts'
import { resolveTheme } from './theme.ts'

/** Iframe height bounds; content beyond the cap scrolls inside the frame. */
const MIN_HEIGHT = 48
const HEIGHT_CAP: Record<VisualizeMeta['mode'], number> = { inline: 800, wide: 1200, page: 800 }

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
export function openInWindow(meta: VisualizeMeta, callId: string): void {
  const { themeVars, colorScheme } = resolveTheme()
  const variant = variantOf(meta)
  const frameDoc = buildFrameDoc({
    fragment: meta.fragment,
    title: meta.title,
    themeVars,
    colorScheme,
    // Distinct from the in-chat token, so these reports never size a card.
    reportToken: `window:${callId}`,
    variant,
  })
  const background = (variant === 'page' ? themeVars.page : themeVars.card) ?? ''
  const page = buildWindowDoc({ frameDoc, title: meta.title, colorScheme, background, variant })
  const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }))
  window.open(url, '_blank', 'noopener')
}

/**
 * Whether this browser can open a card in its own tab: an embedding host may
 * strip `window.open` or Blob URLs, and a page card then renders in place.
 * @returns true when both are available.
 */
function canOpenWindow(): boolean {
  return typeof window.open === 'function' && typeof URL.createObjectURL === 'function'
}

/** The frame variant a card's mode lays its document out for. */
function variantOf(meta: VisualizeMeta): FrameVariant {
  return meta.mode === 'page' ? 'page' : 'card'
}

/** Whether the host UI is in Chinese; the plugin ships no locale catalogue. */
function hostIsZh(): boolean {
  return document.documentElement.lang.toLowerCase().startsWith('zh')
}

/** Accessible name of the open control, in the host's language. */
function openLabel(): string {
  return hostIsZh() ? '在新窗口打开' : 'Open in new window'
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

/**
 * Re-render trigger for host theme switches: bumped whenever the host flips
 * appearance, so each frame document re-resolves the bridged palette.
 * @returns a counter that changes on every theme change.
 */
function useThemeTick(): number {
  const [themeTick, setThemeTick] = useState(0)
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
  return themeTick
}

/**
 * The frame document for one card, rebuilt on theme changes.
 * @param meta - the card.
 * @param reportToken - height-report correlation token.
 * @param variant - surface the document lays out for.
 * @returns the srcdoc string.
 */
function useFrameDoc(meta: VisualizeMeta, reportToken: string, variant: FrameVariant): string {
  const themeTick = useThemeTick()
  return useMemo(() => {
    const { themeVars, colorScheme } = resolveTheme()
    return buildFrameDoc({ fragment: meta.fragment, title: meta.title, themeVars, colorScheme, reportToken, variant })
    // themeTick is the deliberate re-resolution trigger for the palette read.
  }, [meta, reportToken, variant, themeTick])
}

/** The sandboxed frame, sized to its content's reported height up to the mode's cap. */
function SizedFrame({ meta, callId }: { meta: VisualizeMeta; callId: string }) {
  const [height, setHeight] = useState(MIN_HEIGHT)
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
  const doc = useFrameDoc(meta, callId, variantOf(meta))
  return (
    <iframe
      sandbox={FRAME_SANDBOX}
      referrerPolicy="no-referrer"
      title={meta.title}
      srcDoc={doc}
      style={{ ...frameStyle, height }}
    />
  )
}

/**
 * The settled, well-formed card: header line plus the sandboxed frame, or a
 * page card's launcher. Every surface that shows a card — the toolview, the
 * turn tail, replay — goes through here, so a page card is a launcher in all
 * of them.
 */
export function Frame({ meta, callId }: { meta: VisualizeMeta; callId: string }) {
  if (meta.mode === 'page') return <PageLauncher meta={meta} callId={callId} />
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
      <SizedFrame meta={meta} callId={callId} />
    </div>
  )
}

/**
 * Thumbnail geometry: the page lays out in a desktop viewport and the frame
 * is scaled down to the launcher's width, then clipped to a fixed height, so
 * the reader sees the top of the real page rather than a reflowed narrow one.
 */
const THUMB_VIEWPORT_WIDTH = 1280
const THUMB_VIEWPORT_HEIGHT = 800
const THUMB_HEIGHT = 220

const hostBorder = '1px solid var(--dsw-alias-border-l2, rgb(127 127 127 / 25%))'

const launcherStyle: CSSProperties = {
  minWidth: 0,
  maxWidth: '100%',
  border: hostBorder,
  borderRadius: 10,
  overflow: 'hidden',
}

const thumbStyle: CSSProperties = {
  position: 'relative',
  height: THUMB_HEIGHT,
  overflow: 'hidden',
  cursor: 'pointer',
  background: 'var(--dsw-alias-bg-base, transparent)',
  borderBottom: hostBorder,
}

const launcherBarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px 12px',
  padding: '10px 12px',
}

const launcherTextStyle: CSSProperties = { flex: '1 1 220px', minWidth: 0 }

const oneLine: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

const launcherTitleStyle: CSSProperties = { ...oneLine, fontSize: 14, fontWeight: 500, lineHeight: 1.4 }

const launcherSummaryStyle: CSSProperties = { ...oneLine, fontSize: 12, lineHeight: 1.5, opacity: 0.65 }

const actionsStyle: CSSProperties = { display: 'flex', gap: 8, flexShrink: 0, marginLeft: 'auto' }

const buttonBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 30,
  padding: '0 12px',
  borderRadius: 8,
  font: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const primaryButtonStyle: CSSProperties = {
  ...buttonBase,
  border: '1px solid transparent',
  background: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color, rgb(65 118 230))',
  color: 'var(--dsw-alias-label-primary-inverted, rgb(255 255 255))',
  fontWeight: 500,
}

const ghostButtonStyle: CSSProperties = { ...buttonBase, border: hostBorder, background: 'transparent', color: 'inherit' }

/** Launcher strings, in the host's language. */
function launcherLabels() {
  return hostIsZh()
    ? { open: '打开页面', show: '在对话中展开', hide: '收起', kind: '独立页面' }
    : { open: 'Open page', show: 'Show here', hide: 'Collapse', kind: 'Standalone page' }
}

/**
 * The live, inert thumbnail of a page: the same sandboxed page document, laid
 * out at desktop width and scaled into the launcher. Pointer events and focus
 * stay out of the frame, so it never takes a click, a scroll, or a tab stop;
 * a click on the thumbnail opens the page like the button does.
 */
function PageThumbnail({ meta, callId, onOpen }: { meta: VisualizeMeta; callId: string; onOpen: (() => void) | undefined }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const wrap = wrapRef.current
    if (wrap === null) return
    const measure = () => setWidth(wrap.clientWidth)
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])
  // A distinct token: its height reports must never size another frame.
  const doc = useFrameDoc(meta, `thumb:${callId}`, 'page')
  const scale = width > 0 ? width / THUMB_VIEWPORT_WIDTH : 0.5
  return (
    <div ref={wrapRef} style={thumbStyle} aria-hidden="true" onClick={onOpen}>
      <iframe
        sandbox={FRAME_SANDBOX}
        referrerPolicy="no-referrer"
        title={meta.title}
        srcDoc={doc}
        tabIndex={-1}
        style={{
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
          width: THUMB_VIEWPORT_WIDTH,
          height: THUMB_VIEWPORT_HEIGHT,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
          colorScheme: 'normal',
        }}
      />
    </div>
  )
}

/**
 * A page card in the conversation: not the page itself, which is built for a
 * whole tab, but a launcher for it. Opening is always the reader's click — a
 * tab opened without a user gesture is a blocked popup. Where no tab can be
 * opened at all, the page renders in place as a regular card.
 */
function PageLauncher({ meta, callId }: { meta: VisualizeMeta; callId: string }) {
  const opens = canOpenWindow()
  const [expanded, setExpanded] = useState(!opens)
  const labels = launcherLabels()
  const open = opens ? () => openInWindow(meta, callId) : undefined
  return (
    <div style={launcherStyle} data-visualize-launcher="">
      {expanded
        ? <SizedFrame meta={meta} callId={callId} />
        : <PageThumbnail meta={meta} callId={callId} onOpen={open} />}
      <div style={launcherBarStyle}>
        <div style={launcherTextStyle} title={meta.path === '' ? meta.title : meta.path}>
          <div style={launcherTitleStyle}>{meta.title}</div>
          <div style={launcherSummaryStyle}>{meta.summary ?? labels.kind}</div>
        </div>
        {open !== undefined && (
          <div style={actionsStyle}>
            <button type="button" style={ghostButtonStyle} aria-expanded={expanded} onClick={() => setExpanded(on => !on)}>
              {expanded ? labels.hide : labels.show}
            </button>
            <button type="button" style={primaryButtonStyle} onClick={open}>
              <OpenIcon />
              {labels.open}
            </button>
          </div>
        )}
      </div>
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
