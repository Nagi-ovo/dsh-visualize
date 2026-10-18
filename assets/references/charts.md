# Charts

## Choosing the tool

- **Standard chart shapes** — line, area, bar, scatter, doughnut — use
  Chart.js, starting from `../examples/interactive-simulator.html`. The
  library owns axis layout, tick spacing, and label collision, and its first
  render animates by default (lines sweep in, bars grow), so charts arrive
  with the entrance the design calls for at zero extra code. A curve with a
  baseline annotation or a second comparison series is still standard.
- **Custom visuals** — bespoke diagrams, spatial layouts, anything a chart
  library genuinely cannot express — hand-roll SVG per the rules below,
  starting from `../examples/comparison-chart.html`.
- D3 (pinned: `https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js`) remains
  available for data-heavy custom work: scales, shapes, and geo projections.

## Chart.js setup

Load the pinned build:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"></script>
```

Canvas cannot resolve CSS variables (`'var(--viz-series-1)'` paints
nothing) and cannot inherit the CSS font. The frame ships a helper that
bridges both and applies the card style's chart defaults — font family and
size, text and grid colours, which axes carry gridlines, dash pattern, axis
lines, line width, point style. Call it once, before creating any chart, and
create the chart once the card's fonts have loaded:

```js
var root = document.getElementById('my-viz');
var theme = dshViz.chartDefaults(Chart, root);
var chart = null;
dshViz.fontsReady('华东华北 Q1 Q2', root).then(function () {
  chart = new Chart(canvas, {
    type: 'line',
    data: { labels: labels, datasets: [{ data: values, borderColor: theme.series[0] }] },
    options: { responsive: true, maintainAspectRatio: false },
  });
});
```

- `theme` holds resolved colours — `series[0..5]`, `context`, `foreground`,
  `muted`, `primary`, `grid`, `axis` — plus `fontFamily`, `fontSize`,
  `lineWidth`, and `alpha(color, a)` for translucent fills. Chart.js has no
  palette default, so give each dataset its `borderColor` from `theme`.
  `dshViz.color('--token', alpha, root)` resolves any other colour token.
- Pass `fontsReady` the chart's label text (category names, title words) so
  the font slices those characters need load before the first draw; it
  resolves within 2.5s even if a font never arrives. Chart.js measures
  labels once, so any control handler that touches the chart before then
  must check that it exists.
- Do not re-set gridlines, axis lines, font family, or text colour in the
  chart options: the defaults carry the card style. Override them only where
  the chart needs it (a second y axis, a dashed target line). If
  you must set a font, read it from `theme.fontFamily`; never `'inherit'` or
  a CSS variable, which canvas rejects in favour of `10px sans-serif`, and
  never below 11px.
- Size through the container: a wrapping `div` with an explicit height and
  `responsive: true, maintainAspectRatio: false` in the chart options. Never
  fix the canvas width.
- First render animates by itself — do not disable it. Control-driven changes
  go through `chart.data` mutation + `chart.update()`, which transitions in
  place instead of replaying the entrance. Exactly the wanted behavior, free.
- Give the entrance two beats: a ~300ms fade on the chart container lets the
  axes settle first, then the data sweeps across them. One CSS `@keyframes`
  on the wrapper, as in the simulator example.
- A gradient area fill under a single measure: build a canvas gradient from
  `theme.alpha(theme.series[0], 0.25)` down to transparent and set it as the
  dataset `backgroundColor` with `fill: true`.
- Tooltips and legends come themed via the defaults above; drop the legend
  entirely for a single series.

## Hand-rolled SVG rules

- Compute the domain from the data with padding; never hard-code it.
- Size from the measured container and redraw on `ResizeObserver`.
- Keep every mark inside the plot area; clip if a path can escape.
- Draw gridlines in `--viz-grid` and axis lines in `--viz-axis`, and follow
  the card style's guide on which ones to draw.
- After drawing, check that tick and value labels do not overlap; drop ticks
  or re-anchor labels rather than shipping a collision.
- Entrance, once: line draws in via `stroke-dashoffset` (~500ms ease-out),
  fills fade up behind it, labels after their marks. Guard with a flag so
  redraws never replay it; skip under `prefers-reduced-motion`.
- The soft vertical gradient under a single-measure curve (series color at
  ≈0.25 opacity fading to transparent) is the house look for area charts.
