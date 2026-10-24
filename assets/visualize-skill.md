# Visualize

Build small interactive surfaces the user can explore right inside the chat:
parameter-driven simulations, algorithm walkthroughs, charts and plots,
side-by-side comparisons, and product-screen mockups. The `visualize` tool
renders your markup as a live sandboxed card in the conversation, or, for
something to work in rather than glance at, as a full page in its own tab.

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
and a copy of the finished fragment is saved outside the user's project, in
this conversation's own card store; the result names its `path`. Never write
the fragment into the workspace yourself.

## Choosing the surface

- `inline` (default): the card answers the question at hand, fits the chat
  column, and stays within about one and a half screens.
- `wide`: several compact panels must sit side by side to be compared. A
  single dense chart stays inline.
- `page`: the user will *use* the thing rather than glance at it in passing —
  a multi-view tool, a dashboard with filters, a full-screen simulation, map,
  3D scene or large graph, a long multi-step walkthrough, a full desktop
  mockup — or they ask for a separate page or full screen. The chat shows a
  launcher card with a live thumbnail; the user opens the page in its own tab.
  Pass a `summary`: one short line saying what the page lets them do.

A page is still a fragment under every rule below, not a project file. If
they want a page *in their app* or a file to keep, build project files.

## Page layout

Design a `page` for a desktop browser tab (1280px and wider, any height),
not the chat column:

- Wrap it as `<header class="viz-page-header">` (title, then the controls in
  a `.viz-controls` group; it sticks to the top) followed by
  `<main class="viz-page">` (a centred container; add `viz-page-narrow` for
  reading-width content). Group content in `<section class="viz-section">`
  with its own heading.
- Several views go behind tabs: `.viz-tabs` holding `<button
  class="viz-tab" role="tab" aria-selected="true|false">`. Every filter
  visibly changes every view it governs.
- Lay out with grid: a KPI row, then charts two or three across, then
  detail tables. Reflow to one column below about 768px.
- The document scrolls; `min-height: 100vh` is fine on a full-screen canvas
  or the outer shell, never a fixed `height: 100vh` on content that must
  scroll. A canvas sizes to its container, not to a fixed pixel width.
- Build the controls the task needs, not a generic admin template.

## Revising a card

Correcting a rendered card by re-sending its whole markup costs as much as
drawing it again and invites unrequested redesign, so patch it instead:
`action: "update"` with the card's `path`, its `title` restated (and, for a
page, its `summary`, or the launcher loses its caption), and one exact
`old_str` → `new_str` replacement.

- Patch when the correction touches fewer than 20 lines in fewer than 5
  places, and at most 4 times per reply. Re-create the card for anything
  structural or larger — a patch series is not a rewrite.
- `old_str` must match the current card byte for byte, whitespace included,
  and appear exactly once. Keep it as short as stays unique; an empty
  `new_str` deletes the matched region.
- A card keeps one `path` for its whole life; patches rewrite that file, so
  several patches in one reply each build on the one before. Pass the `path`
  exactly as the tool reported it — it may sit outside the workspace, so do
  not read or edit it with file tools.
- A refused patch tells you what the card actually contains at the site you
  aimed at. Correct `old_str` from that and retry in the same reply rather
  than re-rendering blind.
- The card reloads on every change, so anything the user typed, dragged, or
  scrolled inside it resets. Batch corrections instead of trickling them.
- A page tab the user already opened keeps its old version; after patching
  a page, tell them to open it again.

## Fragment rules

The card wraps your fragment in its own document, stylesheet, theme, and
Content-Security-Policy. The tool lints every fragment, patched cards
included, against these rules. Each finding carries a `VZ` code, a
line:column, and a fix. An error renders nothing: apply the fixes and call
again. Warnings arrive with the rendered card; patch them if they matter. If
the result says to stop, tell the user what is blocking the card instead of
retrying.

- Fragment only — never emit `<!doctype>`, `<html>`, `<head>`, or `<body>`.
- Emit real markup with actual newlines, not a string-escaped rendition
  (`\"`, `\n`) of it.
- Write every user-visible label, caption, control, tooltip, and annotation in
  the language the user primarily uses in the current conversation, unless
  they request another language. Keep established product names and technical
  terms unchanged when translating them would make the visualization less
  precise.
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

## Handing back to the conversation

`dshViz.prompt(text)` puts `text` into the chat composer as a draft. The
user reads it, edits it if they like, and sends it; the card never sends
anything itself. Use it where the card ends in a choice the conversation
should act on: a quiz answer, a picked option, a submitted form, "go deeper
on this one".

- Call it only from a click or submit handler, once per action. Never call it
  on load, on a timer, or from `input` / `change` / slider events; those
  calls are dropped.
- Write `text` as the user speaking, in their language, carrying what the
  card knows: `我选了 B（O(n log n)），帮我解释为什么 A 不对`, not
  `button_b_clicked`. Keep it under 2000 characters.
- Check `dshViz.canPrompt` first. It is false where the card cannot hand text
  back (a card opened in its own tab, an older host); hide or disable the
  prompt-only controls then. The card must stay useful without them.
- The text lands in an empty composer, or replaces what a card put there
  before, so a user who changes their pick just gets the new text. If the
  user has typed or edited the draft, it is kept and a notice explains why;
  do not build flows that depend on the text landing.

## Card style

The user picks a card style in the plugin settings. The active one is
appended at the end of this skill under "Active card style", together with
any style files the user wrote. A card's look has two layers:

- The frame applies the style's hard parts on its own: colour tokens, fonts,
  radius, text sizes, and the chart defaults `dshViz.chartDefaults` sets (see
  `references/charts.md`). Keep using the theme variables and base classes;
  do not restate a style's colour values or load its fonts yourself.
- The style guide and the user's style files replace only the Taste section
  of `references/design.md`. Everything else in this skill still applies:
  the fragment rules, theme variables and `light-dark()`, the 11px floor, the
  size limit, the CDN allowlist, the chart setup, and every lint finding. A
  style that says "no gradient fills" overrides the default gradient; no
  style lets a card fetch, skip the theme variables, or set `color-scheme`.
- When they disagree, the order is: what the user asks for in this
  conversation, then the workspace style file, then the global style file,
  then the built-in style.
- Product-screen mockups ignore the card style. Draw them in the product's
  own colours, type and radius, still as `light-dark()` pairs.
- When a user style asks for specific colours, set them as custom properties
  on your root element (`#my-viz { --viz-series-1: light-dark(#…, #…); }`);
  your CSS and `dshViz.chartDefaults(Chart, root)` both read them there.

## In the reply

Around the card, write only what helps the user read or act on it — one or
two sentences at most. Do not mention the tool, the fragment, files, or any
of this machinery, and never paste the markup into the reply.
