/**
 * The plugin's page in the host's settings dialog (「设置」→「可视化」): the
 * card style picker and the user's style files.
 *
 * The style is the plugin's `style` config field, edited through the host's
 * own settings form for this entry (`ctx.configForms.get('dsh-visualize')`,
 * backed by dsh-settings): a save lands in the profile's `cordis.patch.yml`
 * and the running plugin reads it on its next card, with no restart. Where
 * the host has no such form the page says where to set it by hand.
 *
 * Each option shows a live preview: a small sample card built by the real
 * frame builder in that style and the host's current theme, in the same
 * sandbox as a card. The style files go through the plugin's own route on the
 * host `/api` channel (style-files.ts).
 *
 * Laid out like dsh-ads' settings page so the two plugin pages read as
 * siblings: inline rules, neutral alpha borders, inherited text colour.
 *
 * @module
 */

import { useEffect, useId, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { buildFrameDoc } from '../shell.ts'
import { DEFAULT_STYLE, PAGE_CONFIG_GLOBAL, STYLE_IDS, styleIdFrom, type StyleId } from '../style.ts'
import { FRAME_SANDBOX } from '../window-doc.ts'
import type { StyleFilesView, StyleFileView } from '../style-files.ts'
import { resolveTheme } from './theme.ts'
import { useThemeTick } from './VisualizeCard.tsx'
import { styleName, translator, type SettingsLang, type Translate } from './settings-locale.ts'

/** The host's settings form for one plugin entry, as far as this page uses it. */
export interface StyleForm {
  getSnapshot(): StyleFormSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<boolean>
  unset(field: string): Promise<boolean>
}

/** One snapshot of that form. */
export interface StyleFormSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value: Record<string, unknown> | undefined
  user: unknown
  writable: boolean
}

/** A save answer from the style-file route. */
export type StyleFileSave = { ok: true; file: StyleFileView } | { ok: false; reason: string }

/** The style-file route as the page calls it. */
export interface StyleFilesClient {
  /** Read every file; undefined when the host has no such route. */
  load(): Promise<StyleFilesView | undefined>
  save(request: { scope: StyleFileView['scope']; workspaceId?: string; text: string }): Promise<StyleFileSave>
}

/** Props of the page. */
export interface VisualizeSectionProps {
  readonly lang: SettingsLang
  /** The host's form for this plugin's entry; absent on hosts without one. */
  readonly form: StyleForm | undefined
  readonly files: StyleFilesClient
}

/** The page's own rules: states inline styles cannot express. */
const SECTION_CSS = `
.dshviz-option { position: relative; display: flex; flex-direction: column; min-width: 0; border: 1px solid rgba(128, 128, 128, 0.28); border-radius: 10px; overflow: hidden; cursor: pointer; transition: border-color 120ms ease, box-shadow 120ms ease; }
.dshviz-option:hover { border-color: rgba(128, 128, 128, 0.5); }
.dshviz-option[data-selected='true'] { border-color: #2f6fed; box-shadow: 0 0 0 1px #2f6fed; }
.dshviz-option:has(input:focus-visible) { outline: 2px solid #2f6fed; outline-offset: 2px; }
.dshviz-option[data-disabled='true'] { cursor: default; opacity: 0.6; }
.dshviz-radio { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; pointer-events: none; }
.dshviz-textarea:focus-visible, .dshviz-select:focus-visible, .dshviz-button:focus-visible { outline: 2px solid #2f6fed; outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) { .dshviz-option { transition: none; } }
`

/** Install the page rules once per document. */
function useSectionCss(): void {
  useEffect(() => {
    const id = '@nagi-ovo/dsh-visualize/settings.css'
    if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return
    const tag = document.createElement('style')
    tag.dataset.plugin = '@nagi-ovo/dsh-visualize'
    tag.dataset.pluginCss = id
    tag.textContent = SECTION_CSS
    document.head.append(tag)
  }, [])
}

const divider = '1px solid rgba(128, 128, 128, 0.22)'

const headingStyle: CSSProperties = { fontSize: 15, lineHeight: 1.4, fontWeight: 500 }

const blurbStyle: CSSProperties = { fontSize: 13, lineHeight: 1.5, opacity: 0.55, marginTop: 2 }

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: 12,
  marginTop: 12,
}

const PREVIEW_HEIGHT = 124

const previewStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: PREVIEW_HEIGHT,
  border: 0,
  background: 'transparent',
  pointerEvents: 'none',
}

const optionTextStyle: CSSProperties = { padding: '8px 10px 10px', borderTop: divider }

const optionNameStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500 }

const tagStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: '16px',
  padding: '0 6px',
  borderRadius: 999,
  background: 'rgba(128, 128, 128, 0.16)',
  fontWeight: 400,
}

const noticeStyle: CSSProperties = {
  marginTop: 12,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(128, 128, 128, 0.12)',
  fontSize: 13,
  lineHeight: 1.6,
}

const codeStyle: CSSProperties = {
  margin: '6px 0 0',
  padding: '8px 10px',
  borderRadius: 6,
  background: 'rgba(128, 128, 128, 0.12)',
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontSize: 12,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
}

const statusStyle: CSSProperties = { fontSize: 13, lineHeight: 1.5, marginTop: 8, minHeight: 20 }

const buttonBase: CSSProperties = {
  padding: '7px 14px',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const primaryButtonStyle: CSSProperties = { ...buttonBase, border: '1px solid #2f6fed', background: '#2f6fed', color: '#fff' }

const quietButtonStyle: CSSProperties = {
  ...buttonBase,
  padding: '3px 10px',
  border: '1px solid rgba(128, 128, 128, 0.35)',
  background: 'transparent',
  color: 'inherit',
}

const textareaStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 120,
  marginTop: 8,
  padding: '8px 10px',
  border: '1px solid rgba(128, 128, 128, 0.35)',
  borderRadius: 8,
  background: 'transparent',
  color: 'inherit',
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontSize: 13,
  lineHeight: 1.5,
  resize: 'vertical',
}

const selectStyle: CSSProperties = {
  minHeight: 30,
  maxWidth: '100%',
  padding: '0 8px',
  border: '1px solid rgba(128, 128, 128, 0.35)',
  borderRadius: 8,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: 13,
}

const pathStyle: CSSProperties = {
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontSize: 12,
  opacity: 0.6,
  overflowWrap: 'anywhere',
}

/**
 * The sample card every option previews: a headline, a note and a small line
 * chart drawn with the frame's own tokens, so colours, type, radius, grid and
 * line weight all come from the style.
 * @param t - translate function, for the sample's text.
 * @returns the fragment.
 */
export function previewFragment(t: Translate): string {
  const escape = (text: string) => text.replace(/[&<>"]/gu, char => `&#${char.charCodeAt(0)};`)
  const line = 'fill:none;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke'
  return `<div class="card" style="padding:10px 12px">
<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
<h3 style="margin:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escape(t('previewTitle'))}</h3>
<span class="viz-badge">+18%</span>
</div>
<div class="text-small" style="margin:2px 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escape(t('previewNote'))}</div>
<svg viewBox="0 0 220 54" width="100%" height="54" preserveAspectRatio="none" aria-hidden="true">
<line x1="0" y1="18" x2="220" y2="18" style="stroke:var(--viz-grid);stroke-width:1;stroke-dasharray:var(--viz-grid-dash);vector-effect:non-scaling-stroke"/>
<line x1="0" y1="36" x2="220" y2="36" style="stroke:var(--viz-grid);stroke-width:1;stroke-dasharray:var(--viz-grid-dash);vector-effect:non-scaling-stroke"/>
<line x1="0" y1="53" x2="220" y2="53" style="stroke:var(--viz-axis);stroke-width:1;vector-effect:non-scaling-stroke"/>
<polyline points="0,47 31,45 63,46 94,42 126,43 157,40 189,41 220,37" style="${line};stroke:var(--viz-series-2);stroke-width:var(--viz-line-width)"/>
<polyline points="0,42 31,38 63,40 94,31 126,28 157,22 189,17 220,8" style="${line};stroke:var(--viz-series-1);stroke-width:var(--viz-line-width)"/>
</svg>
</div>`
}

/**
 * One option's live preview: the sample through the real frame builder, in
 * this style and the host's current theme, inert like a page thumbnail.
 */
function StylePreview({ id, t }: { id: StyleId; t: Translate }) {
  const themeTick = useThemeTick()
  const { doc, colorScheme } = useMemo(() => {
    const { themeVars, colorScheme } = resolveTheme()
    const doc = buildFrameDoc({
      fragment: previewFragment(t),
      title: styleName(t, id),
      themeVars,
      colorScheme,
      reportToken: `settings-preview:${id}`,
      style: id,
    })
    return { doc, colorScheme }
    // themeTick is the deliberate re-resolution trigger for the palette read.
  }, [id, t, themeTick])
  return (
    <iframe
      key={colorScheme}
      sandbox={FRAME_SANDBOX}
      referrerPolicy="no-referrer"
      title={styleName(t, id)}
      srcDoc={doc}
      tabIndex={-1}
      aria-hidden="true"
      scrolling="no"
      style={{ ...previewStyle, colorScheme }}
    />
  )
}

/** The configured style the node half put on this page, when known. */
function pageStyle(): StyleId | undefined {
  const config = (globalThis as Record<string, unknown>)[PAGE_CONFIG_GLOBAL] as { style?: unknown } | undefined
  return typeof config?.style === 'string' ? styleIdFrom(config.style) : undefined
}

/**
 * Tell this page's not-yet-settled cards the new style, which the node half
 * otherwise writes only when it serves the page.
 * @param style - the saved style.
 */
export function setPageStyle(style: StyleId): void {
  const globals = globalThis as Record<string, unknown>
  const previous = globals[PAGE_CONFIG_GLOBAL]
  globals[PAGE_CONFIG_GLOBAL] = { ...typeof previous === 'object' && previous !== null ? previous : {}, style }
}

const UNAVAILABLE: StyleFormSnapshot = { status: 'unavailable', value: undefined, user: undefined, writable: false }

/** Follow a form's snapshot; a missing form reads as unavailable. */
function useFormSnapshot(form: StyleForm | undefined): StyleFormSnapshot {
  return useSyncExternalStore(
    form?.subscribe.bind(form) ?? noSubscribe,
    form === undefined ? () => UNAVAILABLE : () => form.getSnapshot(),
  )
}

function noSubscribe(): () => void {
  return () => {}
}

/** Whether the user layer sets the style. */
function userSetsStyle(user: unknown): boolean {
  return typeof user === 'object' && user !== null && Object.hasOwn(user, 'style')
}

/** The style picker. */
function StylePicker({ form, t }: { form: StyleForm | undefined; t: Translate }) {
  const snapshot = useFormSnapshot(form)
  const headingId = useId()
  const name = useId()
  const [pending, setPending] = useState<StyleId | undefined>(undefined)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | undefined>(undefined)
  const accepted = snapshot.status === 'ready' ? styleIdFrom(snapshot.value?.style) : undefined
  // Keep the page's live value in step with the host, including saves made elsewhere.
  useEffect(() => {
    if (accepted !== undefined && accepted !== pageStyle()) setPageStyle(accepted)
  }, [accepted])
  const unavailable = form === undefined || snapshot.status === 'unavailable'
  const selected = pending ?? accepted ?? pageStyle() ?? DEFAULT_STYLE
  const disabled = unavailable || snapshot.status !== 'ready' || !snapshot.writable

  /**
   * Write, then report the style the host now holds: the chosen one, or after
   * a reset (`chosen` undefined) whatever the profile inherits, which the form
   * knows once it has answered.
   */
  const run = async (write: () => Promise<boolean>, chosen: StyleId | undefined) => {
    setPending(chosen ?? DEFAULT_STYLE)
    setNotice(undefined)
    try {
      const ok = await write()
      const held = chosen ?? styleIdFrom(form?.getSnapshot().value?.style)
      if (ok) setPageStyle(held)
      setNotice(ok ? { ok, text: t('saved', { style: styleName(t, held) }) } : { ok, text: t('saveFailed') })
    } catch {
      setNotice({ ok: false, text: t('saveFailed') })
    } finally {
      setPending(undefined)
    }
  }
  const choose = (id: StyleId) => {
    if (form === undefined || disabled || id === selected) return
    void run(() => form.set('style', id), id)
  }

  return (
    <section aria-labelledby={headingId}>
      <div id={headingId} style={headingStyle}>{t('styleHeading')}</div>
      <div style={blurbStyle}>{t('styleIntro')}</div>
      {unavailable && (
        <div style={noticeStyle} role="note">
          <div style={{ fontWeight: 500 }}>{t('unavailableTitle')}</div>
          <div>{t('unavailableBody', { path: '<DSH_HOME>/profiles/web/cordis.patch.yml' })}</div>
          <pre style={codeStyle}>{`- id: dsh-visualize\n  name: "@nagi-ovo/dsh-visualize"\n  config:\n    style: ${selected}`}</pre>
        </div>
      )}
      {!unavailable && snapshot.status === 'ready' && !snapshot.writable && (
        <div style={noticeStyle} role="note">{t('readOnly')}</div>
      )}
      <div role="radiogroup" aria-labelledby={headingId} style={gridStyle}>
        {STYLE_IDS.map(id => (
          <label
            key={id}
            className="dshviz-option"
            data-style={id}
            data-selected={id === selected}
            data-disabled={disabled}
          >
            <input
              className="dshviz-radio"
              type="radio"
              name={name}
              value={id}
              checked={id === selected}
              disabled={disabled}
              onChange={() => choose(id)}
            />
            <StylePreview id={id} t={t} />
            <div style={optionTextStyle}>
              <div style={optionNameStyle}>
                {styleName(t, id)}
                <span style={{ ...pathStyle, opacity: 0.5, fontSize: 11 }}>{id}</span>
                {id === DEFAULT_STYLE && <span style={tagStyle}>{t('defaultTag')}</span>}
              </div>
              <div style={{ ...blurbStyle, marginTop: 0 }}>{t(`style.${id}.desc`)}</div>
            </div>
          </label>
        ))}
      </div>
      <div style={{ ...statusStyle, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span role="status" style={{ color: notice !== undefined && !notice.ok ? '#c2382c' : 'inherit', opacity: notice?.ok === false ? 1 : 0.7 }}>
          {pending !== undefined ? t('saving') : notice?.text ?? ''}
        </span>
        {form !== undefined && !disabled && userSetsStyle(snapshot.user) && pending === undefined && (
          <>
            <span style={{ ...blurbStyle, marginTop: 0 }}>{t('overridden')}</span>
            <button
              type="button"
              className="dshviz-button"
              style={quietButtonStyle}
              onClick={() => void run(() => form.unset('style'), undefined)}
            >
              {t('reset')}
            </button>
          </>
        )}
      </div>
    </section>
  )
}

/** One style file's editor. */
function FileEditor({ file, max, t, files, onSaved }: {
  file: StyleFileView
  max: number
  t: Translate
  files: StyleFilesClient
  onSaved: (file: StyleFileView) => void
}) {
  const [draft, setDraft] = useState(file.text)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | undefined>(undefined)
  const textareaId = useId()
  useEffect(() => setDraft(file.text), [file.path, file.text])
  const bytes = new TextEncoder().encode(draft).byteLength
  const over = bytes - max
  const blocked = file.blocked !== undefined
  const save = async () => {
    setSaving(true)
    setNotice(undefined)
    try {
      const result = await files.save({
        scope: file.scope,
        ...file.workspaceId === undefined ? {} : { workspaceId: file.workspaceId },
        text: draft,
      })
      if (result.ok) {
        onSaved(result.file)
        setNotice({ ok: true, text: result.file.exists ? t('fileSaved') : t('fileRemoved') })
      } else {
        setNotice({ ok: false, text: t('fileSaveFailed', { reason: result.reason }) })
      }
    } finally {
      setSaving(false)
    }
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <label htmlFor={textareaId} style={pathStyle}>{file.path}</label>
        <span style={tagStyle}>{file.exists ? t('fileExists') : t('fileMissing')}</span>
      </div>
      {blocked && <div style={noticeStyle} role="note">{t('fileBlocked')}</div>}
      <textarea
        id={textareaId}
        className="dshviz-textarea"
        style={textareaStyle}
        value={draft}
        readOnly={blocked}
        spellCheck={false}
        placeholder={t('placeholder')}
        aria-invalid={over > 0 || undefined}
        onChange={event => setDraft(event.target.value)}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: over > 0 ? '#c2382c' : 'inherit', opacity: over > 0 ? 1 : 0.55 }}>
          {over > 0 ? t('tooLarge', { max, over }) : t('bytes', { bytes, max })}
        </span>
        <button
          type="button"
          className="dshviz-button"
          style={{ ...primaryButtonStyle, opacity: blocked || saving || over > 0 || draft === file.text ? 0.5 : 1 }}
          disabled={blocked || saving || over > 0 || draft === file.text}
          onClick={() => void save()}
        >
          {saving ? t('saving') : t('saveFile')}
        </button>
      </div>
      <div role="status" style={{ ...statusStyle, color: notice !== undefined && !notice.ok ? '#c2382c' : 'inherit', opacity: notice?.ok === false ? 1 : 0.7 }}>
        {notice?.text ?? ''}
      </div>
    </div>
  )
}

/** The style files. */
function StyleFiles({ files, t }: { files: StyleFilesClient; t: Translate }) {
  const [view, setView] = useState<StyleFilesView | null | undefined>(undefined)
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined)
  const headingId = useId()
  const selectId = useId()
  useEffect(() => {
    let live = true
    files.load().then(
      loaded => { if (live) setView(loaded ?? null) },
      () => { if (live) setView(null) },
    )
    return () => { live = false }
  }, [files])
  const replace = (next: StyleFileView) => setView(current => current === null || current === undefined
    ? current
    : { ...current, files: current.files.map(file => file.path === next.path ? next : file) })
  const max = view?.maxBytes ?? 4096
  const global = view?.files.find(file => file.scope === 'global')
  const workspaces = view?.files.filter(file => file.scope === 'workspace') ?? []
  const workspace = workspaces.find(file => file.workspaceId === workspaceId) ?? workspaces[0]
  return (
    <section aria-labelledby={headingId} style={{ marginTop: 18, paddingTop: 18, borderTop: divider }}>
      <div id={headingId} style={headingStyle}>{t('filesHeading')}</div>
      <div style={blurbStyle}>{t('filesIntro', { max })}</div>
      {view === undefined && <div style={{ ...blurbStyle, marginTop: 12 }}>{t('filesLoading')}</div>}
      {view === null && (
        <div style={noticeStyle} role="note">
          <div>{t('filesUnavailable')}</div>
          <pre style={codeStyle}>{'<DSH_HOME>/visualize/style.md\n<workspace>/.dsh/visualize-style.md'}</pre>
        </div>
      )}
      {global !== undefined && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{t('globalFile')}</div>
          <FileEditor file={global} max={max} t={t} files={files} onSaved={replace} />
        </div>
      )}
      {workspace !== undefined && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: divider }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label htmlFor={selectId} style={{ fontSize: 14, fontWeight: 500 }}>{t('workspaceFile')}</label>
            {workspaces.length > 1
              ? (
                  <select
                    id={selectId}
                    className="dshviz-select"
                    style={selectStyle}
                    value={workspace.workspaceId}
                    onChange={event => setWorkspaceId(event.target.value)}
                  >
                    {workspaces.map(file => (
                      <option key={file.workspaceId} value={file.workspaceId}>{file.title ?? file.path}</option>
                    ))}
                  </select>
                )
              : <span id={selectId} style={{ fontSize: 13, opacity: 0.7 }}>{workspace.title ?? ''}</span>}
          </div>
          <FileEditor key={workspace.path} file={workspace} max={max} t={t} files={files} onSaved={replace} />
        </div>
      )}
    </section>
  )
}

/**
 * Draw the settings page.
 * @param props - see {@link VisualizeSectionProps}.
 * @returns the section content column.
 */
export function VisualizeSection({ lang, form, files }: VisualizeSectionProps) {
  useSectionCss()
  const t = useMemo(() => translator(lang), [lang])
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <StylePicker form={form} t={t} />
      <StyleFiles files={files} t={t} />
    </div>
  )
}
