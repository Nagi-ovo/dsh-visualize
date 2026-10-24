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
nothing) and cannot inherit the CSS font. Create every chart through
`dshViz.chart`, which bridges both and applies the card style's chart
defaults — font family and size, text and grid colours, which axes carry
gridlines, dash pattern, axis lines, line width, point style:

```js
var plot = dshViz.chart('#my-viz-plot', function (theme) {
  return {
    type: 'line',
    data: { datasets: [{ borderColor: theme.series[0] }] },
  };
});
dshViz.bind('#my-viz', function (p) {
  plot.update(labelsFor(p), valuesFor(p));
});
```

- The chart is created once the card's fonts have loaded (Chart.js measures
  labels once). `plot.update(labels, data0, data1, …)` sets the labels
  (`undefined` keeps them) and each dataset's data in order; before the
  chart exists it only stores them, so the first draw animates in with the
  latest values. No existence check, no separate first-draw path.
- `dshViz.chart` fills in `responsive: true, maintainAspectRatio: false` and
  drops the legend for a single dataset; set either yourself to override.
  `plot.chart` is the Chart once `plot.ready` resolves.
- `theme` holds resolved colours — `series[0..5]`, `context`, `foreground`,
  `muted`, `primary`, `grid`, `axis` — plus `fontFamily`, `fontSize`,
  `lineWidth`, `alpha(color, a)` for translucent fills, and `fade(color)`
  for the gradient area fill. Chart.js has no palette default, so give each
  dataset its `borderColor` from `theme`. `dshViz.color('--token', alpha,
  root)` resolves any other colour token.
- Do not re-set gridlines, axis lines, font family, or text colour in the
  chart options: the defaults carry the card style. Override them only where
  the chart needs it (a second y axis, a dashed target line). If
  you must set a font, read it from `theme.fontFamily`; never `'inherit'` or
  a CSS variable, which canvas rejects in favour of `10px sans-serif`, and
  never below 11px.
- Size through the container: a wrapping `div` with an explicit height.
  Never fix the canvas width.
- First render animates by itself — do not disable it. Control-driven changes
  go through `plot.update(…)`, which transitions in place instead of
  replaying the entrance. Exactly the wanted behavior, free.
- Give the entrance two beats: a ~300ms fade on the chart container lets the
  axes settle first, then the data sweeps across them. One CSS `@keyframes`
  on the wrapper, as in the simulator example.
- A gradient area fill under a single measure: `backgroundColor:
  theme.fade(theme.series[0]), fill: true` (the series colour at 0.25
  fading to transparent down the plot area).
- Tooltips and legends come themed via the defaults above.
- A chart library or setup `dshViz.chart` does not fit still calls
  `dshViz.chartDefaults(Chart, root)` once and draws after
  `dshViz.fontsReady(labelText, root)`.

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
