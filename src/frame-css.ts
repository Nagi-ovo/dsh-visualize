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
 * keep the frame legible in both appearances via `light-dark()`.
 *
 * @module @dsh-external/dsh-visualize/frame-css
 */

/** The frame stylesheet, inlined into the sandboxed srcdoc document. */
export const FRAME_CSS = `
:root {
  color-scheme: light dark;
  --background: var(--dsh-viz-background, transparent);
  --foreground: var(--dsh-viz-foreground, light-dark(rgb(26 28 31), rgb(240 242 245)));
  --card: var(--dsh-viz-card, light-dark(rgb(0 0 0 / 4%), rgb(255 255 255 / 6%)));
  --card-foreground: var(--dsh-viz-foreground, light-dark(rgb(26 28 31), rgb(240 242 245)));
  --muted-foreground: var(--dsh-viz-muted-foreground, light-dark(rgb(26 28 31 / 55%), rgb(240 242 245 / 55%)));
  --border: var(--dsh-viz-border, light-dark(rgb(0 0 0 / 10%), rgb(255 255 255 / 12%)));
  --primary: var(--dsh-viz-primary, light-dark(rgb(65 118 230), rgb(110 150 240)));
  --primary-foreground: var(--dsh-viz-primary-foreground, light-dark(rgb(255 255 255), rgb(13 13 13)));
  --viz-series-1: var(--dsh-viz-primary, light-dark(rgb(65 118 230), rgb(110 150 240)));
  --viz-series-2: light-dark(rgb(226 116 26), rgb(245 152 66));
  --viz-series-3: light-dark(rgb(16 148 82), rgb(72 196 130));
  --viz-series-4: light-dark(rgb(146 94 220), rgb(176 132 240));
  --viz-series-5: light-dark(rgb(212 66 84), rgb(240 110 126));
  --viz-series-6: light-dark(rgb(160 138 22), rgb(206 182 70));
  --radius: 8px;
  --font-size-base: 14px;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--background);
  color: var(--foreground);
  font: 400 var(--font-size-base)/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
h1, h2, h3 { margin: 0 0 0.5em; font-weight: 500; line-height: 1.3; }
h1 { font-size: 1.3em; }
h2 { font-size: 1.15em; }
h3 { font-size: 1em; }
p { margin: 0 0 0.75em; }
a { color: var(--primary); }
svg text { fill: var(--foreground); font-size: 12px; }
.text-small { font-size: 12px; color: var(--muted-foreground); }

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
.viz-stat > :first-child { font-size: 12px; color: var(--muted-foreground); }
.viz-stat-value { font-size: 1.4em; font-weight: 500; line-height: 1.2; }
.viz-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--primary) 14%, transparent);
  color: var(--primary);
  font-size: 12px;
}

.form-label { display: block; font-size: 12px; color: var(--muted-foreground); margin-bottom: 4px; }
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
th { font-weight: 500; color: var(--muted-foreground); font-size: 12px; }
.table-responsive { overflow-x: auto; }
`
