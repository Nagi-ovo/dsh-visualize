/**
 * The stylesheet injected into every visualization frame: theme tokens with
 * host-bridged overrides, a minimal reset, and the base-class vocabulary the
 * bundled skill teaches (`.card`, `.btn`, `.viz-*`, form utilities). Kept as a
 * TS string so the browser bundle needs no CSS loader and the node-side specs
 * can assert against it.
 *
 * Token contract: every `--<name>` here is declared as
 * `var(--dsh-viz-<name>, <fallback>)`. The card resolves the host palette
 * (DSH `--dsw-alias-*` design tokens, whale-blue accent included) and injects
 * the `--dsh-viz-*` values on the frame's `:root`; outside DSH the fallbacks
 * keep the frame legible in both appearances via `light-dark()`. A card
 * style (style.ts) injects its own `--dsh-viz-*` values over the host ones;
 * the defaults here are the `whale` style. `--viz-grid-axes` (`value`,
 * `both`, `none`), `--viz-grid-dash` and `--viz-line-width` carry no CSS
 * meaning of their own: `dshViz.chartDefaults` reads them for Chart.js.
 *
 * @module @nagi-ovo/dsh-visualize/frame-css
 */

/** The frame stylesheet, inlined into the sandboxed srcdoc document. */
export const FRAME_CSS = `
:root {
  color-scheme: light dark;
  --background: var(--dsh-viz-background, transparent);
  --foreground: var(--dsh-viz-foreground, light-dark(rgb(26 28 31), rgb(240 242 245)));
  --card: var(--dsh-viz-card, light-dark(rgb(0 0 0 / 4%), rgb(255 255 255 / 6%)));
  --card-foreground: var(--dsh-viz-card-foreground, var(--foreground));
  --muted-foreground: var(--dsh-viz-muted-foreground, light-dark(rgb(26 28 31 / 55%), rgb(240 242 245 / 55%)));
  --border: var(--dsh-viz-border, light-dark(rgb(0 0 0 / 10%), rgb(255 255 255 / 12%)));
  --primary: var(--dsh-viz-primary, light-dark(rgb(65 118 230), rgb(110 150 240)));
  --primary-foreground: var(--dsh-viz-primary-foreground, light-dark(rgb(255 255 255), rgb(13 13 13)));
  --viz-series-1: var(--dsh-viz-series-1, var(--primary));
  --viz-series-2: var(--dsh-viz-series-2, light-dark(rgb(225 105 16), rgb(236 142 59)));
  --viz-series-3: var(--dsh-viz-series-3, light-dark(rgb(2 155 100), rgb(72 196 130)));
  --viz-series-4: var(--dsh-viz-series-4, light-dark(rgb(147 89 185), rgb(183 145 226)));
  --viz-series-5: var(--dsh-viz-series-5, light-dark(rgb(214 63 76), rgb(233 108 122)));
  --viz-series-6: var(--dsh-viz-series-6, light-dark(rgb(154 139 45), rgb(206 182 70)));
  --viz-context: var(--dsh-viz-context, var(--muted-foreground));
  --viz-grid: var(--dsh-viz-grid, var(--border));
  --viz-grid-axes: var(--dsh-viz-grid-axes, value);
  --viz-grid-dash: var(--dsh-viz-grid-dash, 0);
  --viz-axis: var(--dsh-viz-axis, var(--border));
  --viz-line-width: var(--dsh-viz-line-width, 2);
  --font-sans: var(--dsh-viz-font-sans, system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif);
  --font-display: var(--dsh-viz-font-display, var(--font-sans));
  --font-mono: var(--dsh-viz-font-mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace);
  --radius: var(--dsh-viz-radius, 8px);
  --font-size-base: var(--dsh-viz-font-size-base, 14px);
  --font-size-small: var(--dsh-viz-font-size-small, max(11px, calc(var(--font-size-base) - 2px)));
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--background);
  color: var(--foreground);
  font: 400 var(--font-size-base)/1.5 var(--font-sans);
}
h1, h2, h3 { margin: 0 0 0.5em; font-family: var(--font-display); font-weight: 500; line-height: 1.3; }
h1 { font-size: 1.3em; }
h2 { font-size: 1.15em; }
h3 { font-size: 1em; }
p { margin: 0 0 0.75em; }
a { color: var(--primary); }
code, kbd, samp, pre { font-family: var(--font-mono); }
svg text { fill: var(--foreground); font-size: var(--font-size-small); }
.text-small { font-size: var(--font-size-small); color: var(--muted-foreground); }

.card {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
}

.btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--foreground);
  font: inherit;
  cursor: pointer;
}
.btn:hover { background: color-mix(in oklab, var(--foreground) 6%, transparent); }
.btn-primary,
.btn[aria-pressed='true'],
.btn[aria-selected='true'],
.btn.is-selected {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}
.btn-ghost { border-color: transparent; }
.btn:disabled { opacity: 0.5; cursor: default; }

.viz-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}
.viz-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.viz-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 10px;
  margin-bottom: 12px;
}
.viz-stat .viz-stat-label,
.viz-stat > :first-child { font-size: var(--font-size-small); color: var(--muted-foreground); }
.viz-stat-value { font-size: 1.4em; font-weight: 500; line-height: 1.2; }
.viz-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--primary) 14%, transparent);
  color: var(--primary);
  font-size: var(--font-size-small);
}

.form-label { display: block; font-size: var(--font-size-small); color: var(--muted-foreground); margin-bottom: 4px; }
.form-control, .form-select {
  width: 100%;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--foreground);
  font: inherit;
}
.form-check { display: flex; align-items: center; gap: 6px; }
.form-check input { accent-color: var(--primary); }
input[type='range'] { accent-color: var(--primary); }

table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 5px 10px; border-bottom: 1px solid var(--border); }
th { font-weight: 500; color: var(--muted-foreground); font-size: var(--font-size-small); }
.table-responsive { overflow-x: auto; }
`

/**
 * Additions for a `page` frame: a full browser tab rather than a card in the
 * chat column. The surface turns opaque (a sticky header must cover what
 * scrolls under it), the body drops the card inset so a header can run
 * edge to edge, and a few layout classes cover the page skeleton the skill
 * teaches: a sticky header, a centred content container, sections, tabs.
 */
export const PAGE_CSS = `
:root { --background: var(--dsh-viz-page, light-dark(rgb(255 255 255), rgb(24 24 27))); }
html { background: var(--background); }
body { min-height: 100vh; }
.viz-page { max-width: 1440px; margin: 0 auto; padding: 24px clamp(16px, 3vw, 40px) 48px; }
.viz-page-narrow { max-width: 960px; }
.viz-page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 12px clamp(16px, 3vw, 40px);
  background: var(--background);
  border-bottom: 1px solid var(--border);
}
.viz-page-header h1 { margin: 0; font-size: 1.25em; }
.viz-page-header .viz-controls { margin: 0 0 0 auto; }
.viz-section { margin-top: 32px; }
.viz-section:first-child { margin-top: 0; }
.viz-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
.viz-tab {
  appearance: none;
  padding: 8px 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  cursor: pointer;
}
.viz-tab:hover { color: var(--foreground); }
.viz-tab[aria-selected='true'] { color: var(--foreground); border-bottom-color: var(--primary); font-weight: 500; }
@media (max-width: 768px) {
  .viz-page-header .viz-controls { margin-left: 0; width: 100%; }
}
`
