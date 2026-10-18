Paper: draw it like a journal figure. Left and bottom axes with short outward
ticks, no gridlines (`dshViz.chartDefaults` sets this up), no fills except a
~15% band for uncertainty. Encode every series twice — colour plus marker
shape or dash pattern (the chart defaults rotate both per dataset; do the same
in hand-rolled SVG) — so the figure survives greyscale and colour-vision
deficiency; label lines directly when there are three or fewer. Put the
caption below the plot as "Figure 1 · …" (图 1 · …) in `.text-small`, stating
what is shown and what the error bars mean. Axis titles carry symbols and
units ("learning rate η", "loss (nats)"). If the card contains formulas,
render them with KaTeX 0.16.29 from jsdelivr
(`https://cdn.jsdelivr.net/npm/katex@0.16.29/dist/katex.min.css` and
`…/dist/katex.min.js`); otherwise do not load it. Prefer small multiples over
a crowded panel. Keep the entrance short; precision outranks polish.
