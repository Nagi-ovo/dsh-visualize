# Design

## Taste

The difference between a widget and a good widget is restraint.

- Give the visual room. Work on an 8px spacing rhythm; whitespace is part of
  the design, not wasted area. When in doubt, remove a panel rather than
  shrink four.
- One focal element per card. Numbers speak loudest, labels whisper: values
  in large `--foreground`, their labels small and `--muted-foreground`,
  never the reverse.
- Color is meaning. The canvas stays neutral; the accent lands only where
  attention belongs — the active element, the single measure, the selected
  state. Peers get distinct colors only when identity must persist; a chart
  where everything is colorful says nothing.
- Motion explains change: 150–400ms, ease-out, animating a state the user
  caused. Decorative motion — pulsing, looping, sliding for its own sake —
  ages in seconds. Honor `prefers-reduced-motion`.
- Format numbers for reading: thousands separators, a unit, a stable number
  of decimals, `font-variant-numeric: tabular-nums` anywhere digits change
  in place.
- The initial state is already the answer: sensible defaults, a drawn curve,
  a populated grid — never an empty canvas waiting for input.
- Cut structure that carries no data: gridlines you don't read, borders that
  outline nothing, a legend for a single series.
- Gradient fills follow the job: a single-measure area chart takes the soft
  series-color gradient by default — it reads as polish. A multi-series
  comparison, or any chart the user reads for precise values, skips fills
  entirely: clarity outranks beauty the moment they compete.

## Theme tokens

Every color comes from a variable or a `light-dark(<light>, <dark>)` pair;
the card bridges the host palette (DSH whale-blue accent included) and tracks
theme switches live.

- Surfaces and text: `--background`, `--foreground`, `--card`,
  `--card-foreground`, `--muted-foreground`, `--border`.
- Accent: `--primary`, `--primary-foreground`.
- Series palette: `--viz-series-1` … `--viz-series-6`; `--viz-series-1` is
  the single measure / active element.
- SVG text takes `fill: var(--foreground)` at 11px effective size or larger.

## Base classes

The frame stylesheet ships these utilities — prefer them over re-implementing
the same controls, and add custom CSS only where they run out.

- `.card` — the single framed surface, for a numeric summary or a bounded
  interactive area. Charts and the fragment root stay transparent and
  unframed; cards never nest.
- `.viz-stat` / `.viz-stat-value` — one summary figure with a muted label.
- `.viz-grid` — equal columns that collapse gracefully on narrow widths.
- `.viz-row` — a wrapping inline group of related values or actions.
- `.viz-controls` — the control strip governing one visualization.
- `.viz-badge` — a small display-only accent pill (not a button).
- `.btn` / `.btn-primary` / `.btn-ghost` — native `<button>` styling; one
  primary action per group.
- `.form-label`, `.form-control`, `.form-select`, `.form-check`,
  `.form-switch` — native form elements only.
- `.text-small` for secondary annotations; `.table-responsive` only when a
  table genuinely cannot fit.

## Layout

- Build the least UI that serves the request: no invented search boxes,
  filters, reset buttons, KPI strips, or status cards. One mechanism per
  piece of state; controls the user asked for and no more.
- Span the available card width, and let content reflow — stack and wrap on
  narrow widths. Avoid fixed outer widths, inner scrollbars,
  `position: fixed`, and viewport-height sizing; the card grows to fit the
  content's height.
- Use semantic elements and native keyboard-accessible controls; leave tab
  order and focus outlines alone.
