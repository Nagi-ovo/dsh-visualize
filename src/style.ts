/**
 * Card style presets: the user-chosen half of a card's look. The base
 * contract (fragment rules, CSP, size, theme-variable use, the 11px floor,
 * lint) belongs to the plugin and no style can change it; a style only
 * supplies
 *
 * - hard style, injected by the frame shell and therefore deterministic:
 *   values for the frame's `--dsh-viz-*` hooks (one `light-dark()` value
 *   covers both appearances, because the frame's `color-scheme` follows the
 *   host), an optional webfont stylesheet, a small scoped CSS block, and the
 *   chart defaults `dshViz.chartDefaults` applies on top of the tokens;
 * - soft style, a short prose guide (`assets/styles/<id>.md`) the skill
 *   provider appends to the skill body, which overrides only the taste
 *   guidance in `references/design.md`.
 *
 * Every preset leaves the background transparent so the card sits on the
 * host's chat surface. Values were contrast- and colour-vision-checked
 * against the host surfaces (light #ffffff/#f5f6f7, dark #151517/#232324).
 *
 * Pure and DOM-free: the node half reads ids and prose paths, the browser
 * card reads the hard style for the id persisted in each card's meta.
 *
 * @module @nagi-ovo/dsh-visualize/style
 */

/** Every built-in style id, in settings order; the first is the default. */
export const STYLE_IDS = ['whale', 'editorial', 'paper', 'sketch', 'terminal'] as const

/** One built-in style id. */
export type StyleId = typeof STYLE_IDS[number]

/** The style a card takes when its meta names none, or one this build lacks. */
export const DEFAULT_STYLE: StyleId = 'whale'

/** Chart.js knobs a style sets beyond what its CSS tokens carry. */
export interface ChartPreset {
  /** Line `tension`; 0 draws straight segments. */
  tension?: number
  /** Default point radius; 0 hides points until hover. */
  pointRadius?: number
  /** Point shapes rotated per dataset (double encoding with colour). */
  pointStyles?: readonly string[]
  /** Dash patterns rotated per dataset; `[]` is solid. */
  dashes?: readonly (readonly number[])[]
  /** Draw the value axis line; false leaves only its gridlines. */
  valueAxisLine?: boolean
  /** Axis line width in px. */
  axisWidth?: number
}

/** One built-in style. */
export interface StylePreset {
  id: StyleId
  /** Settings label, `中文 · English`. */
  label: string
  /**
   * Values for the frame's `--dsh-viz-<name>` hooks, keyed by `<name>`. They
   * override the host-bridged palette, so a preset that sets one colour token
   * should set the whole family it belongs to.
   */
  vars: Readonly<Record<string, string>>
  /** Webfont stylesheet loaded in the frame `<head>`; absent for system type. */
  fontHref?: string
  /** Scoped CSS appended after the base stylesheet. */
  extraCss?: string
  /** Defaults `dshViz.chartDefaults` applies to Chart.js. */
  chart: ChartPreset
}

const SYSTEM_SANS = "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"

/** `light-dark()` shorthand for the tables below. */
function ld(light: string, dark: string): string {
  return `light-dark(${light}, ${dark})`
}

/** Six series as `--dsh-viz-series-N` entries. */
function series(pairs: readonly (readonly [string, string])[]): Record<string, string> {
  return Object.fromEntries(pairs.map(([light, dark], i) => [`series-${i + 1}`, ld(light, dark)]))
}

const GOOGLE_FONTS = 'https://fonts.googleapis.com/css2?'

/** The built-in styles by id. */
export const STYLES: Readonly<Record<StyleId, StylePreset>> = {
  whale: {
    id: 'whale',
    label: '鲸蓝 · Whale (default)',
    // Everything comes from the host bridge and the stylesheet fallbacks.
    vars: {},
    chart: {},
  },
  editorial: {
    id: 'editorial',
    label: '报刊 · Editorial',
    vars: {
      'foreground': ld('#1a1a1a', '#f2efe9'),
      'muted-foreground': ld('#5f5f5f', '#a8a39b'),
      'card': ld('rgb(140 110 60 / 6%)', 'rgb(255 235 205 / 5%)'),
      'border': ld('rgb(0 0 0 / 12%)', 'rgb(255 255 255 / 14%)'),
      'primary': ld('#b24032', '#f07a62'),
      'primary-foreground': ld('#ffffff', '#151517'),
      ...series([
        ['#b24032', '#f07a62'], ['#28659d', '#78ade8'], ['#26826b', '#5eccab'],
        ['#a87810', '#e3b04b'], ['#7a4e8c', '#c395d2'], ['#6e6259', '#b2a696'],
      ]),
      'context': ld('#8a8a8a', '#6f6f6f'),
      'grid': ld('rgb(0 0 0 / 8%)', 'rgb(255 255 255 / 9%)'),
      'axis': ld('rgb(26 26 26 / 60%)', 'rgb(242 239 233 / 60%)'),
      'font-display': "'Source Serif 4', 'Noto Serif SC', 'Songti SC', serif",
      'font-sans': "'Libre Franklin', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
      'radius': '2px',
    },
    fontHref: `${GOOGLE_FONTS}family=Source+Serif+4:opsz,wght@8..60,400;8..60,600`
      + '&family=Libre+Franklin:wght@400;500;600&family=Noto+Serif+SC:wght@500;700&display=swap',
    extraCss: 'h1, h2, h3 { font-weight: 600; letter-spacing: -0.005em; }',
    chart: { pointRadius: 0, valueAxisLine: false },
  },
  paper: {
    id: 'paper',
    label: '论文 · Paper',
    vars: {
      'foreground': ld('#111111', '#ececec'),
      'muted-foreground': ld('#555555', '#a6a6a6'),
      'card': ld('rgb(0 0 0 / 2.5%)', 'rgb(255 255 255 / 4%)'),
      'border': ld('rgb(0 0 0 / 18%)', 'rgb(255 255 255 / 18%)'),
      'primary': ld('#0072b2', '#58b6ed'),
      'primary-foreground': ld('#ffffff', '#111111'),
      ...series([
        ['#0072b2', '#58b6ed'], ['#d55e00', '#e8743b'], ['#0c9c67', '#35b67e'],
        ['#c774a4', '#da91bd'], ['#9d7d36', '#e69f00'], ['#3b3b3b', '#d0d0d0'],
      ]),
      'grid': ld('rgb(0 0 0 / 6%)', 'rgb(255 255 255 / 7%)'),
      'grid-axes': 'none',
      'axis': ld('rgb(17 17 17 / 70%)', 'rgb(236 236 236 / 70%)'),
      'line-width': '1.5',
      'font-display': "'STIX Two Text', 'Noto Serif SC', 'Songti SC', serif",
      'font-sans': "'STIX Two Text', 'Noto Serif SC', 'Songti SC', serif",
      'radius': '2px',
    },
    fontHref: `${GOOGLE_FONTS}family=STIX+Two+Text:wght@400;500;600&family=Noto+Serif+SC:wght@400;600&display=swap`,
    chart: {
      pointRadius: 3,
      pointStyles: ['circle', 'triangle', 'rect', 'rectRot', 'crossRot', 'star'],
      dashes: [[], [6, 3], [2, 2], [8, 3, 2, 3]],
    },
  },
  sketch: {
    id: 'sketch',
    label: '手绘 · Sketch',
    vars: {
      'foreground': ld('#1e1e1e', '#ececec'),
      'muted-foreground': ld('#5c5f66', '#a6a7ab'),
      'card': ld('rgb(250 176 5 / 9%)', 'rgb(250 176 5 / 7%)'),
      'border': ld('rgb(30 30 30 / 35%)', 'rgb(236 236 236 / 35%)'),
      'primary': ld('#2d71b7', '#74c0fc'),
      'primary-foreground': ld('#ffffff', '#1e1e1e'),
      ...series([
        ['#2d71b7', '#74c0fc'], ['#cb1913', '#ff8787'], ['#36a047', '#91ea91'],
        ['#7048e8', '#9775fa'], ['#e8590c', '#ffa94d'], ['#108f6c', '#55e6c6'],
      ]),
      'grid-axes': 'none',
      'axis': ld('rgb(30 30 30 / 60%)', 'rgb(236 236 236 / 60%)'),
      'line-width': '2.5',
      'font-display': "'Kalam', 'LXGW WenKai TC', 'Kaiti SC', 'STKaiti', cursive",
      'font-sans': "'Kalam', 'LXGW WenKai TC', 'Kaiti SC', 'STKaiti', cursive",
      'font-mono': "'LXGW WenKai Mono TC', ui-monospace, monospace",
      'font-size-base': '15px',
      'radius': '10px',
    },
    fontHref: `${GOOGLE_FONTS}family=Kalam:wght@400;700&family=LXGW+WenKai+TC:wght@400;700`
      + '&family=LXGW+WenKai+Mono+TC:wght@400&display=swap',
    // A hand-drawn card edge, and exact figures back in a legible sans.
    extraCss: `.card { border-width: 1.5px; border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px; }
.viz-stat-value, table { font-family: ${SYSTEM_SANS}; }`,
    chart: { tension: 0.35, pointRadius: 0, axisWidth: 1.5 },
  },
  terminal: {
    id: 'terminal',
    label: '终端 · Terminal',
    vars: {
      'foreground': ld('#1f2328', '#d6dccf'),
      'muted-foreground': ld('#59636e', '#8f9a8c'),
      'card': ld('rgb(0 0 0 / 3.5%)', 'rgb(50 216 135 / 5%)'),
      'border': ld('rgb(0 0 0 / 16%)', 'rgb(214 220 207 / 16%)'),
      'primary': ld('#177a46', '#32d887'),
      'primary-foreground': ld('#ffffff', '#0d0f0d'),
      ...series([
        ['#1e9157', '#32d887'], ['#8c5e03', '#f2b33d'], ['#3a757f', '#8ac9d4'],
        ['#9b0b9e', '#e07ce0'], ['#cf222e', '#ff6b6b'], ['#0a50ae', '#79a8ff'],
      ]),
      'grid': ld('rgb(0 0 0 / 10%)', 'rgb(214 220 207 / 10%)'),
      'grid-axes': 'both',
      'grid-dash': '2 4',
      'line-width': '1.5',
      'font-display': "'JetBrains Mono', 'LXGW WenKai Mono TC', 'Sarasa Mono SC', ui-monospace, 'SF Mono', monospace",
      'font-sans': "'JetBrains Mono', 'LXGW WenKai Mono TC', 'Sarasa Mono SC', ui-monospace, 'SF Mono', monospace",
      'font-mono': "'JetBrains Mono', 'LXGW WenKai Mono TC', 'Sarasa Mono SC', ui-monospace, 'SF Mono', monospace",
      'font-size-base': '13px',
      'radius': '0px',
    },
    fontHref: `${GOOGLE_FONTS}family=JetBrains+Mono:wght@400;500;700&family=LXGW+WenKai+Mono+TC:wght@400;700&display=swap`,
    extraCss: 'body { font-variant-numeric: tabular-nums; }',
    chart: { tension: 0, pointRadius: 2, pointStyles: ['rect'] },
  },
}

/**
 * `globalThis` property the node half sets on every DSH web page it serves —
 * `{ style }`, the configured card style — so the browser half knows the
 * active style before any card in the page has settled.
 */
export const PAGE_CONFIG_GLOBAL = '__DSH_VISUALIZE_CONFIG__'

/**
 * Path of the node half's style-file route on the host's `/api` channel,
 * which the settings page calls (style-files.ts).
 */
export const STYLE_FILES_PATH = '/api/dsh-visualize/style-files'

/**
 * Narrow a persisted or configured value to a style id. Wire data may come
 * from an older card (no style) or a newer build (an id this one lacks); both
 * render in the default rather than declining the card.
 * @param value - the raw value.
 * @returns a known style id.
 */
export function styleIdFrom(value: unknown): StyleId {
  return typeof value === 'string' && (STYLE_IDS as readonly string[]).includes(value)
    ? value as StyleId
    : DEFAULT_STYLE
}
