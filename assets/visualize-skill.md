# Visualize

Build small interactive surfaces the user can explore right inside the chat:
parameter-driven simulations, algorithm walkthroughs, charts and plots,
side-by-side comparisons, and product-screen mockups. The `visualize` tool
renders your markup as a live sandboxed card in the conversation.

- Reach for a card when seeing or manipulating something answers the question
  better than prose would. A request that merely mentions data or a web page
  does not by itself call for one.
- When the user asks for a real deliverable — a website, a page in their app,
  a component, a standalone file — build project files instead; that is not an
  in-conversation card.
- When a static labeled diagram of nodes and edges already tells the whole
  story, emit a fenced Mermaid block and skip the tool. The card earns its
  place through motion, interaction, or adjustable inputs.

## Resources

Read from this skill's resource directory as the task demands — before your
first chart, read `references/charts.md`; before styling anything, read
`references/design.md`:

- `references/design.md` — taste, theme tokens, base classes, layout.
- `references/charts.md` — Chart.js-first charting, theme-color resolution,
  hand-rolled SVG rules, entrance animation recipes.
- `examples/interactive-simulator.html` — sliders driving a Chart.js area
  curve: probe-resolved theme colors, gradient fill, in-place updates. The
  template for any standard chart.
- `examples/comparison-chart.html` — a hand-rolled SVG comparison with
  direct labels and a hover detail. The template for custom visuals only.

## Calling the tool

Pass the markup directly as the `fragment` argument, with an optional `title`
and optional `mode`. The card starts rendering while you are still generating,
and a copy of the finished fragment lands in the session workspace under
`viz/`. To revise a visualization, call the tool again with the new markup.

Reserve `mode: "wide"` for layouts where several compact panels must sit
beside each other to be compared; a single dense chart or a full-page mockup
stays at the default width.

## Fragment rules

The card wraps your fragment in its own document, stylesheet, theme, and
Content-Security-Policy. The tool rejects violations loudly.

- Fragment only — never emit `<!doctype>`, `<html>`, `<head>`, or `<body>`.
- Emit real markup with actual newlines, not a string-escaped rendition
  (`\"`, `\n`) of it.
- Give your root element a unique ID and locate it with
  `document.getElementById(...)`. Scripts must not rely on
  `document.currentScript` to find their root.
- Stay under the deployment's fragment size limit (1 MB unless configured
  otherwise). Large inline datasets should be reduced first: fewer rows,
  coarser bins, fewer decimal places, no unused fields.
- Inline `<script>` and `<style>` work. Network APIs do not — `fetch`, XHR,
  WebSocket, and form submission are blocked by policy and fail without an
  error message.
- External static assets may come only from these hosts:
  `cdnjs.cloudflare.com`, `esm.sh`, `cdn.jsdelivr.net`, `unpkg.com`,
  `fonts.googleapis.com`, `fonts.gstatic.com`, `fonts.bunny.net` — always
  with a pinned version.
- Every color comes from a theme variable or a `light-dark()` pair — the
  token list and utility classes are in `references/design.md`.
- Never declare `color-scheme` yourself. The document already carries the
  host's scheme; redeclaring it on your root flips every `light-dark()` in
  your subtree to the viewer's OS preference, which can invert your text
  against the host-matched background.
- A chart's first draw animates in, once; `references/charts.md` has the
  recipes (Chart.js gives this by default).
- Before finishing, confirm every element your script queries exists, every
  identifier is defined, and the main interaction visibly changes the output.

## In the reply

Around the card, write only what helps the user read or act on it — one or
two sentences at most. Do not mention the tool, the fragment, files, or any
of this machinery, and never paste the markup into the reply.
